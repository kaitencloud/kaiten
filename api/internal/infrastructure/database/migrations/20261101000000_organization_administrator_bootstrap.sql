-- +goose Up
-- Block old backend/seeder writes BEFORE any history snapshot. Organization first
-- matches supported organization -> assignment writers and identity rebinds.
-- SHARE ROW EXCLUSIVE blocks writes, not their preceding row-lock reads; the
-- migration takes no organization row locks, avoiding a row/table lock inversion.
LOCK TABLE organization IN SHARE ROW EXCLUSIVE MODE;
-- Old bootstrap writes the global latch before its assignment. Lock it in that
-- order too: backfill must not wait on a latch writer blocked by our assignment lock.
LOCK TABLE user_administrator_bootstrap IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE user_organization_authorization IN SHARE ROW EXCLUSIVE MODE;

-- Permanent UUID tombstones and append-only identity aliases have no foreign keys:
-- deleting a user, assignment or organization must not reopen its election.
CREATE TABLE organization_administrator_bootstrap (
  organization_id UUID PRIMARY KEY,
  user_id UUID,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE organization_administrator_bootstrap_alias (
  external_id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL
);

-- Every initialization path, including direct demo-seeder assignments, records the
-- current external identity in the same transaction. Alias ownership is historical
-- provenance only: conflict never overwrites or removes an earlier owner's alias.
-- +goose StatementBegin
CREATE FUNCTION record_organization_administrator_bootstrap_alias() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO organization_administrator_bootstrap_alias (external_id, organization_id)
  SELECT external_id, id FROM organization WHERE id = NEW.organization_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER record_organization_administrator_bootstrap_alias
AFTER INSERT ON organization_administrator_bootstrap
FOR EACH ROW EXECUTE FUNCTION record_organization_administrator_bootstrap_alias();

-- +goose StatementBegin
CREATE FUNCTION seal_organization_administrator_bootstrap() RETURNS TRIGGER AS $$
BEGIN
  -- BEFORE INSERT: take the same org lock as management/JIT before any assignment
  -- tuple locks. This also serializes the seeder's direct grants with rebinds.
  PERFORM id FROM organization WHERE id = NEW.organization_id FOR NO KEY UPDATE;
  INSERT INTO organization_administrator_bootstrap (organization_id)
  VALUES (NEW.organization_id) ON CONFLICT DO NOTHING;
  -- Mixed-version rollout: an old Ready pod still runs the global election.
  -- Closing it on every local initialization prevents a second administrator in
  -- this org. Keep any earlier record exactly; NEW uses no sentinel identity.
  -- This is compatibility metadata, never a gate on the new per-org election.
  INSERT INTO user_administrator_bootstrap (singleton, user_id, organization_id)
  VALUES (TRUE, NEW.user_id, NEW.organization_id)
  ON CONFLICT (singleton) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER seal_organization_administrator_bootstrap
BEFORE INSERT ON user_organization_authorization
FOR EACH ROW EXECUTE FUNCTION seal_organization_administrator_bootstrap();

-- The seeder supports rebinding external_id. Preserve BOTH sides of every rebind
-- of an initialized org. An alias-only recreated UUID is sealed on INSERT too,
-- so changing its external_id again cannot escape the historical initialization.
-- +goose StatementBegin
CREATE FUNCTION preserve_organization_administrator_bootstrap_identity() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM organization_administrator_bootstrap WHERE organization_id = NEW.id)
     OR EXISTS (SELECT 1 FROM organization_administrator_bootstrap_alias WHERE external_id = NEW.external_id)
     OR (TG_OP = 'UPDATE' AND EXISTS (
       SELECT 1 FROM organization_administrator_bootstrap_alias WHERE external_id = OLD.external_id)) THEN
    INSERT INTO organization_administrator_bootstrap (organization_id)
    VALUES (NEW.id) ON CONFLICT DO NOTHING;
    INSERT INTO organization_administrator_bootstrap_alias (external_id, organization_id)
    VALUES (NEW.external_id, NEW.id) ON CONFLICT DO NOTHING;
    IF TG_OP = 'UPDATE' THEN
      INSERT INTO organization_administrator_bootstrap_alias (external_id, organization_id)
      VALUES (OLD.external_id, NEW.id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER preserve_organization_administrator_bootstrap_identity
AFTER INSERT OR UPDATE OF external_id ON organization
FOR EACH ROW EXECUTE FUNCTION preserve_organization_administrator_bootstrap_identity();

-- Preserve ALL assignments, including empty/disabled policies and removed members,
-- not just administrators. Keep the old global tombstone untouched even when its
-- organization was deleted. Marker inserts record every currently known alias.
INSERT INTO organization_administrator_bootstrap (organization_id, user_id, claimed_at)
SELECT organization_id, user_id, claimed_at FROM user_administrator_bootstrap
ON CONFLICT DO NOTHING;
INSERT INTO organization_administrator_bootstrap (organization_id)
SELECT DISTINCT organization_id FROM user_organization_authorization
ON CONFLICT DO NOTHING;

-- Preserve existing custom-role policy evidence from released #71 too.
-- New role definitions alone do NOT consume a future organization's election.
LOCK TABLE user_organization_role IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO organization_administrator_bootstrap (organization_id)
SELECT DISTINCT organization_id FROM user_organization_role
ON CONFLICT DO NOTHING;

-- Explicit seeder policies may already exist after #71 migrated an empty install,
-- while its global latch is still empty. Close the old election from a real stored
-- assignment AFTER per-org history copying, without recording extra bootstrap
-- winners in the new registry. Preserve an existing legacy record byte-for-byte.
INSERT INTO user_administrator_bootstrap (singleton, user_id, organization_id)
SELECT TRUE, user_id, organization_id FROM user_organization_authorization
ORDER BY organization_id, user_id LIMIT 1
ON CONFLICT (singleton) DO NOTHING;

-- +goose Down
-- Downgrading discards per-org history; do not use rollback as access recovery.
DROP TRIGGER preserve_organization_administrator_bootstrap_identity ON organization;
DROP FUNCTION preserve_organization_administrator_bootstrap_identity();
DROP TRIGGER seal_organization_administrator_bootstrap ON user_organization_authorization;
DROP FUNCTION seal_organization_administrator_bootstrap();
DROP TRIGGER record_organization_administrator_bootstrap_alias ON organization_administrator_bootstrap;
DROP FUNCTION record_organization_administrator_bootstrap_alias();
DROP TABLE organization_administrator_bootstrap_alias;
DROP TABLE organization_administrator_bootstrap;
