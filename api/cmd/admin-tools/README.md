# User and role administration

`kaiten-admin-tools` runs the same Users facade and usecases as Core, in-process.
It reads `KAITEN_DATABASE_CONNECTION_STRING` from the process environment only;
there is no implicit `.env` loading or default database. It refuses an outdated
schema. Build from `api/` with `go build -o bin/kaiten-admin-tools ./cmd/admin-tools`.
Use only a database you are authorized to administer.

Every user-management and role-management command requires:

- Exactly one of `--organization-external-id` or `--organization-id` (UUID).
- `--actor-external-id`, identifying an **enabled, stored administrator in that
  organization**. Operation scopes supplied by the local adapter do not bypass
  this policy; write operations recheck the administrator under the organization
  lock. `write:users` alone, custom roles, machines and `system:kaiten` do not
  qualify. Revoked, deleted, disabled and other-tenant actors are refused.
- `--external-id` for commands targeting a user, or `--slug` for a role.

Plain tables are the default; `--json` writes the API-shaped payload to stdout,
without log messages mixed into it. List users returns one cursor page; plain
output includes `next_cursor` when another page exists, and JSON uses
`items`, `hasMore`, `nextCursor`. Use `--cursor` and `--limit` (1–200).
Lists contain live human memberships, including disabled assignments, not
machine identities or soft-deleted users/memberships.

Examples below use synthetic identifiers. Select the authorized database before
running them; never paste a production connection string into a support ticket.

```sh
kaiten-admin-tools user list --organization-external-id org_example --actor-external-id user_admin --json
kaiten-admin-tools user get --organization-external-id org_example --actor-external-id user_admin --external-id user_member

# Replace ALL assignment fields, not an additive grant. Custom roles use slugs.
kaiten-admin-tools user authorization --organization-external-id org_example --actor-external-id user_admin --external-id user_member --roles support --permissions read:customers --enabled=true --yes
# `grant` aliases `authorization`; `--scopes` aliases `--permissions`.
# Empty lists explicitly remove grants. Enabled must still be explicit.
kaiten-admin-tools user grant --organization-external-id org_example --actor-external-id user_admin --external-id user_member --roles '' --scopes '' --enabled=true --yes

# These change only enabled, atomically preserving the latest roles/permissions.
kaiten-admin-tools user disable --organization-external-id org_example --actor-external-id user_admin --external-id user_member --yes
kaiten-admin-tools user enable --organization-external-id org_example --actor-external-id user_admin --external-id user_member --yes

# The profile is GLOBAL across memberships, and both fields are replaced.
kaiten-admin-tools user update --organization-external-id org_example --actor-external-id user_admin --external-id user_member --name 'Example Person' --email person@example.com

kaiten-admin-tools role list --organization-external-id org_example --actor-external-id user_admin --json
kaiten-admin-tools role create --organization-external-id org_example --actor-external-id user_admin --slug support --name Support --description 'Support team' --permissions read:users,read:customers --yes
kaiten-admin-tools role update --organization-external-id org_example --actor-external-id user_admin --slug support --name Support --description '' --scopes read:customers --yes
# Remove this role from user assignments before deletion.
kaiten-admin-tools role delete --organization-external-id org_example --actor-external-id user_admin --slug support --yes
```

## Safety and semantics

- Access changes (assignment replacement, enable/disable, role creation/update/
  deletion) require `--yes` before opening the database. Replacement requires
  explicit roles, permissions and enabled; role writes require explicit name,
  description and permissions. Empty strings deliberately clear lists or the
  description, never preserve an omitted value.
- Permissions are only `scope.OrganizationScopes()`; arbitrary/wildcard/platform
  deletion grants are refused. The module resolves custom role existence in the
  current organization. Duplicate CSV entries are normalized by this adapter.
- `administrator` confers the administrator policy independently of scopes.
  Built-in roles cannot be edited or deleted, and custom roles cannot confer
  administrator status. Editing a custom scope group affects **all assigned
  users immediately**. Assigned-role deletion is refused.
- The last enabled, live human administrator cannot be demoted or disabled by
  these management commands. Disable changes authorization in **one tenant**;
  it neither deletes the global user nor removes their memberships.
- Profile edits replace the global name/email shared across memberships. The
  external identity is immutable. A successful edit takes profile ownership
  from identity-provider claims, so later sign-ins do not overwrite it.
- These commands do not invent a recovery administrator. Existing installations
  use the authorization migration's active-human backfill; empty installations
  use the one-time first-human bootstrap. If neither leaves an administrator in
  the tenant, management refuses access and does not reopen bootstrap. Existing
  direct database-operator authority and Platform operations remain separate:
  `user delete` and `organization membership delete` are destructive operator
  overrides, not role grants, and can remove an administrator. Do not use them
  as ordinary access management or expect a subsequent sign-in to recover it.

## Verification

From `api/`, validation tests need no database:

```sh
go test ./cmd/admin-tools -run 'TestUserManagementValidationWithoutDatabase|TestParseUserCSV|TestRoleValidationWithoutDatabase'
```

The actual command-tree integration tests start disposable PostgreSQL with the
existing testcontainers helper and synthetic users. They do not deploy services
or contact a provider. Docker must be available:

```sh
go test -shuffle=on ./cmd/admin-tools
```
