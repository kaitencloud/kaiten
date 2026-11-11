-- flatten_partitions.sql runs in the throwaway database schema-docs builds, after
-- the migrations and before db2dbml. db2dbml reads ordinary tables only
-- (pg_class.relkind = 'r'): it lists the partitions of a partitioned table but not
-- the table itself, then stops on the first constraint that names the table,
-- "Can't find table". This replaces each partitioned table with an ordinary one
-- of the same columns, check constraints, keys, foreign keys and indexes, under
-- the same names, so the DBML documents the table once and its partitions not
-- at all. Nothing else reads this database.
DO $$
DECLARE
  parent record;
  r record;
  statements text[];
  stmt text;
BEGIN
  FOR parent IN
    SELECT c.oid, n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'p' AND NOT c.relispartition AND n.nspname = 'public'
  LOOP
    statements := '{}';
    -- Its own primary key, unique, exclusion and foreign key constraints; the
    -- check constraints come with LIKE below.
    FOR r IN
      SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = parent.oid AND contype IN ('p', 'u', 'x', 'f')
      ORDER BY contype = 'f', conname
    LOOP
      statements := statements || format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s', parent.nspname, parent.relname, r.conname, r.def);
    END LOOP;
    -- Its indexes that back no constraint.
    FOR r IN
      SELECT pg_get_indexdef(i.indexrelid) AS def FROM pg_index i
      WHERE i.indrelid = parent.oid
        AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.indexrelid AND k.conrelid = parent.oid)
      ORDER BY 1
    LOOP
      statements := statements || replace(r.def, ' ON ONLY ', ' ON ');
    END LOOP;
    -- The foreign keys other tables hold on it.
    FOR r IN
      SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE confrelid = parent.oid AND contype = 'f' AND conparentid = 0 AND conrelid <> parent.oid
      ORDER BY 1, 2
    LOOP
      statements := statements || format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tbl, r.conname, r.def);
    END LOOP;

    EXECUTE format('CREATE TABLE %I.%I (LIKE %I.%I INCLUDING ALL EXCLUDING INDEXES)', parent.nspname, parent.relname || '__flat', parent.nspname, parent.relname);
    EXECUTE format('DROP TABLE %I.%I CASCADE', parent.nspname, parent.relname);
    EXECUTE format('ALTER TABLE %I.%I RENAME TO %I', parent.nspname, parent.relname || '__flat', parent.relname);
    FOREACH stmt IN ARRAY statements LOOP
      EXECUTE stmt;
    END LOOP;
  END LOOP;
END
$$;
