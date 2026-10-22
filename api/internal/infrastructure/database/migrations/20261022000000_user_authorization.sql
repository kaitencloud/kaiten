-- +goose Up
-- Authorization belongs to membership, not identity or a JWT. This unmerged
-- migration preserves existing active human access exactly once on upgrade.
CREATE TABLE user_organization_authorization (
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  roles TEXT[] NOT NULL DEFAULT '{}',
  permissions TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (organization_id, user_id)
    REFERENCES user_on_organization (organization_id, user_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT user_authorization_roles_not_null CHECK (
    array_position(roles, NULL) IS NULL),
  CONSTRAINT user_authorization_permissions_not_null CHECK (
    array_position(permissions, NULL) IS NULL)
);

-- This deployment-wide latch has no foreign keys deliberately. Removing the
-- winning user, their membership, their authorization or even their organization
-- must NEVER make a subsequent login bootstrap again. Claimed only in the same
-- transaction as successful human provisioning and the administrator grant.
CREATE TABLE user_administrator_bootstrap (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Custom role groups are organization-owned. Built-ins are immutable templates
-- in users/schema; reserved slugs can never become custom capabilities.
CREATE TABLE user_organization_role (
  organization_id UUID NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' AND length(slug) <= 64),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  permissions TEXT[] NOT NULL DEFAULT '{}' CHECK (array_position(permissions, NULL) IS NULL),
  PRIMARY KEY (organization_id, slug),
  CHECK (slug NOT IN ('administrator', 'viewer', 'editor'))
);

-- Existing live HUMAN memberships were connected before local authorization
-- existed: preserve all of them as administrators, never machines/deleted rows.
-- Goose runs this migration once, atomically. Subsequent startup migration calls
-- do not regrant roles; the permanent latch prevents a later login bootstrapping.
INSERT INTO user_organization_authorization (organization_id, user_id, roles)
SELECT m.organization_id, u.id, ARRAY['administrator']::TEXT[]
FROM "user" u
JOIN user_on_organization m ON m.user_id = u.id AND m.deleted_at IS NULL
JOIN organization o ON o.id = m.organization_id
WHERE u.type = 'human' AND u.deleted_at IS NULL AND u.external_id NOT LIKE 'system:%';

INSERT INTO user_administrator_bootstrap (singleton, user_id, organization_id)
SELECT TRUE, user_id, organization_id FROM user_organization_authorization
ORDER BY organization_id, user_id LIMIT 1;
-- An empty deployment deliberately keeps the latch empty for first-human JIT.

-- An administrator-managed profile is not overwritten by later IdP claims.
-- The identity stays in "user"; this table records only who owns profile updates.
CREATE TABLE user_managed_profile (
  user_id UUID PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE
);

-- +goose Down
DROP TABLE user_managed_profile;
DROP TABLE user_organization_role;
DROP TABLE user_administrator_bootstrap;
DROP TABLE user_organization_authorization;
