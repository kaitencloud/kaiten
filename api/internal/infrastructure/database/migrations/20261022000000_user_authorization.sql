-- +goose Up
-- Authorization belongs to membership, not identity or a JWT. No rows are
-- backfilled: existing members, like later JIT members, start denied by default.
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
  CONSTRAINT user_authorization_builtin_roles CHECK (
    roles <@ ARRAY['administrator', 'viewer', 'editor']::TEXT[]
    AND array_position(roles, NULL) IS NULL),
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

-- An administrator-managed profile is not overwritten by later IdP claims.
-- The identity stays in "user"; this table records only who owns profile updates.
CREATE TABLE user_managed_profile (
  user_id UUID PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE
);

-- +goose Down
DROP TABLE user_managed_profile;
DROP TABLE user_administrator_bootstrap;
DROP TABLE user_organization_authorization;
