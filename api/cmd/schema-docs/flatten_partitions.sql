-- flatten_partitions.sql runs in the throwaway database schema-docs builds, after
-- the migrations and before db2dbml. db2dbml reads ordinary tables only
-- (pg_class.relkind = 'r'): it lists the partitions of a partitioned table but not
-- the table itself, then stops on the first constraint that names the table,
-- "Can't find table". This replaces each partitioned table with an ordinary one
-- of the same columns, keys, foreign keys, indexes and comments, under the same
-- names, so the DBML documents the table once and its partitions not at all.
-- Nothing else reads this database.
--
-- It prints the tables it flattened, with their partition key, one markdown
-- list item each: the document's "Partitioned tables" section is that output,
-- so the list and the flattening cannot disagree.
--
-- Anything it cannot carry over stops the run rather than vanish from the
-- document: the table is dropped RESTRICT, so a view, a rule or a policy that
-- depends on it fails here.
CREATE TEMPORARY TABLE schema_docs_flattened (relname text PRIMARY KEY, partition_key text NOT NULL);

DO $$
DECLARE
  parent record;
  r record;
  flat text;
  keep text[];      -- the table's indexes, then its keys, then its foreign keys
  incoming text[];  -- the foreign keys other tables hold on it, re-added last
  unhook text[];    -- the same foreign keys, dropped before the table
  sequences text[]; -- the sequences it owns, handed to the copy
  stmt text;
BEGIN
  FOR parent IN
    SELECT c.oid, n.nspname, c.relname, pg_get_partkeydef(c.oid) AS partition_key,
           obj_description(c.oid, 'pg_class') AS comment
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'p' AND NOT c.relispartition AND n.nspname = 'public'
    ORDER BY c.relname
  LOOP
    -- A name of its own, short whatever the table's: relname || a suffix could
    -- be cut back to relname itself at 63 bytes.
    flat := format('schema_docs_flat_%s', parent.oid);
    keep := '{}';
    incoming := '{}';
    unhook := '{}';
    sequences := '{}';

    -- Its indexes first, so that a key or a foreign key rebuilt after can rely
    -- on one: every index but those its own primary key, unique and exclusion
    -- constraints create. A foreign key's conindid names the index it
    -- references, which a self-reference makes one of this table's: that
    -- index is rebuilt too.
    FOR r IN
      SELECT pg_get_indexdef(i.indexrelid) AS def, ic.relname AS name,
             obj_description(i.indexrelid, 'pg_class') AS comment
      FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
      WHERE i.indrelid = parent.oid
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint k
          WHERE k.conindid = i.indexrelid AND k.conrelid = parent.oid AND k.contype IN ('p', 'u', 'x')
        )
      ORDER BY ic.relname
    LOOP
      keep := keep || replace(r.def, ' ON ONLY ', ' ON ');
      IF r.comment IS NOT NULL THEN
        keep := keep || format('COMMENT ON INDEX %I.%I IS %L', parent.nspname, r.name, r.comment);
      END IF;
    END LOOP;

    -- Its own keys, then its foreign keys; the check constraints come with LIKE.
    -- conparentid = 0 leaves out the constraints PostgreSQL derives from one: a
    -- foreign key that references a partitioned table gets one per partition of
    -- it, which the rebuilt foreign key derives again.
    FOR r IN
      SELECT conname, pg_get_constraintdef(oid) AS def, obj_description(oid, 'pg_constraint') AS comment
      FROM pg_constraint
      WHERE conrelid = parent.oid AND contype IN ('p', 'u', 'x', 'f') AND conparentid = 0
      ORDER BY contype = 'f', conname
    LOOP
      keep := keep || format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s', parent.nspname, parent.relname, r.conname, r.def);
      IF r.comment IS NOT NULL THEN
        keep := keep || format('COMMENT ON CONSTRAINT %I ON %I.%I IS %L', r.conname, parent.nspname, parent.relname, r.comment);
      END IF;
    END LOOP;

    -- The foreign keys other tables hold on it, not those its partitions inherit.
    FOR r IN
      SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def,
             obj_description(oid, 'pg_constraint') AS comment
      FROM pg_constraint
      WHERE confrelid = parent.oid AND contype = 'f' AND conparentid = 0 AND conrelid <> parent.oid
      ORDER BY 1, 2
    LOOP
      unhook := unhook || format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
      incoming := incoming || format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tbl, r.conname, r.def);
      IF r.comment IS NOT NULL THEN
        incoming := incoming || format('COMMENT ON CONSTRAINT %I ON %s IS %L', r.conname, r.tbl, r.comment);
      END IF;
    END LOOP;

    -- A serial column's sequence belongs to the table: LIKE copies the default
    -- that calls it, and dropping the table would drop the sequence and that
    -- default with it.
    FOR r IN
      SELECT a.attname, pg_get_serial_sequence(format('%I.%I', parent.nspname, parent.relname), a.attname) AS seq
      FROM pg_attribute a
      WHERE a.attrelid = parent.oid AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      IF r.seq IS NOT NULL THEN
        sequences := sequences || format('ALTER SEQUENCE %s OWNED BY %I.%I.%I', r.seq, parent.nspname, flat, r.attname);
      END IF;
    END LOOP;

    -- Columns, defaults, identities, generated columns, check constraints and
    -- column comments come with LIKE.
    EXECUTE format('CREATE TABLE %I.%I (LIKE %I.%I INCLUDING ALL EXCLUDING INDEXES)', parent.nspname, flat, parent.nspname, parent.relname);
    FOREACH stmt IN ARRAY sequences || unhook LOOP
      EXECUTE stmt;
    END LOOP;
    EXECUTE format('DROP TABLE %I.%I RESTRICT', parent.nspname, parent.relname);
    EXECUTE format('ALTER TABLE %I.%I RENAME TO %I', parent.nspname, flat, parent.relname);
    IF parent.comment IS NOT NULL THEN
      EXECUTE format('COMMENT ON TABLE %I.%I IS %L', parent.nspname, parent.relname, parent.comment);
    END IF;
    FOREACH stmt IN ARRAY keep || incoming LOOP
      EXECUTE stmt;
    END LOOP;

    INSERT INTO schema_docs_flattened VALUES (parent.relname, parent.partition_key);
  END LOOP;
END
$$;

SELECT '- `' || relname || '`: `' || partition_key || '`' FROM schema_docs_flattened ORDER BY relname;
