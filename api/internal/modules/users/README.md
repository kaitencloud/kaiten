# Human users and authorization

The authentication provider identifies people (`sub`, optional name/email) and
supplies the external organization execution context. It does **not** authorize
operations. Core ignores JWT scopes, roles and permissions, including malformed
or wildcard values. Keep Core behind the required validating reverse proxy;
unsigned internal tokens must never be accepted directly from untrusted clients.

## Bootstrap and assignments

On an empty deployment, the first successful human sign-in wins a
**deployment-wide** bootstrap election
and becomes administrator **in the organization they signed into**. This preserves
Core's existing organization boundary; it does not grant cross-organization
Platform authority. A unique singleton row and its role grant commit in the same
transaction as the user and membership. Concurrent sign-ins elect one winner;
failed transactions, disabled members, machines and system identities cannot win.
The marker survives deletion of the winner or organization and never reboots.

The first authorization migration (`20261022000000`) backfills **every existing
live human membership** as administrator once, excluding machines, system
identities, deleted users and removed memberships. If any eligible membership
exists it permanently claims the deployment latch. Repeated migration startup
never regrants a demoted user. Empty deployments leave the latch unclaimed.
This migration is amended in the unmerged authorization PR: databases that
already applied an earlier version will not replay it automatically.

Later JIT users receive no resource permissions until assigned locally. Every
active human can read their own `/api/me` profile and effective permissions.
`administrator`, `viewer`, and `editor` are immutable built-in templates; custom
roles group organization permissions under stable organization-owned slugs.
Explicit permissions use Core's organization scope vocabulary. User
management additionally requires the **stored administrator role**: granting
`write:users`, including through an editor role or service token, cannot promote
someone or access the directory. Assignments and enablement belong to membership.

Permissions and active-user/membership checks are loaded on **every request**, even
when JIT identity resolution is cached. REST, GraphQL and OFREP use the same
resolved caller grants. Revocation affects the next request with the same JWT;
already-running requests/streams are not retroactively canceled.

## Core API

| Method | Path (under `/api`) | Purpose |
| --- | --- | --- |
| GET | `/me` | Current human profile, roles, effective scopes and vocabulary |
| GET | `/users` | Administrator directory; `limit` and opaque `cursor` pagination |
| GET | `/users/{id}` | Administrator reads a human member |
| PUT | `/users/{id}` | Administrator replaces global display name/email |
| PUT | `/users/{id}/authorization` | Replace `enabled`, `roles`, `permissions` |
| PATCH | `/users/{id}/assignments` | Replace roles/direct scopes while preserving enabled |
| PATCH | `/users/{id}/enabled` | Atomically set enablement, preserving latest assignments |
| GET | `/roles` | Administrator reads built-in and current-organization custom roles |
| POST | `/roles` | Create custom `{slug,name,description,permissions}`; returns 201 |
| PUT | `/roles/{slug}` | Replace `{name,description,permissions}`; slug stays immutable |
| DELETE | `/roles/{slug}` | Delete an unassigned custom role; returns 204 |

`/me` returns `{user,organizationId,scopes,availableRoles,availablePermissions}`.
`availableRoles` and `/roles` return `Role` objects:
`{slug,name,description,permissions,builtIn,isAdministrator}`. Administrator UI
capability comes from enabled stored `administrator` assignment, never
`write:users`. `/users` returns `{items,nextCursor?,hasMore}`.

Custom-role permissions and direct user permissions accept only
`scope.OrganizationScopes()` (explicit read/write scopes, no wildcard or
Platform delete scopes). `write:X` implies `read:X`. Assignments name role slugs
and must resolve in the current organization. Definitions are expanded freshly
every request; role edits immediately change access with the same credential.
Unknown/corrupt stored assignments fail closed. Derived role permissions are
never written back as direct user permissions.

Role and assignment mutations share the organization lock and recheck stored
administrator capability after waiting. Deleting even a disabled user's assigned
role is refused with `409 Users.RoleInUse`; unassign before deletion. Built-in
mutations return `409 Users.BuiltInRole`, duplicate slugs
`409 Users.RoleAlreadyExists`, missing roles `404 Users.RoleNotFound`, invalid
role payloads `400 Users.InvalidRole`, and unknown assignments
`400 Users.InvalidAuthorization`. No role permission can create administrator
capability. Credentialed `kaiten.Users` facade methods expose the same policies to
CLI adapters without transport types; no recovery bypass is added.

Profile name/email are global across memberships. An administrator editing them
changes how the same identity appears in other organizations. Once edited locally,
future provider profile claims do not overwrite them. External identity, account
type and membership cannot be rewritten by these endpoints. Disablement blocks
only the current organization's access; administrators can re-enable that member.

Management writes serialize on the organization, recheck the acting administrator
inside the transaction and refuse disabling/demoting its last active administrator
with `409 Users.LastAdministrator`. No global user delete is exposed on Core.
The privileged Platform deletion APIs and direct database operators remain recovery
overrides and can bypass this guard. Other organizations require explicit operator
provisioning; there is no automatic second bootstrap or provider-admin fallback.

## Machine credentials and development

The `ksh_` exchange emits only identity plus an internal token ID, not permissions.
Core reloads token grants and checks token kind, subject/org binding, owner and
membership liveness, expiry and revocation on every request. Provider-signed JWTs
cannot select this internal-token path. A service-token creator can delegate only
permissions already held, never Platform delete permissions. Machine credentials
never enter human JIT/bootstrap. Platform `ksm_` authentication remains separate.

Development JWTs contain identity only. The explicit demo seeder stores admin
assignments for demo human memberships instead of granting JWT wildcards; it does
not overwrite an existing assignment. Token generation alone grants no access.

## Enterprise extension boundary

Identity resolution, users-owned authorization resolution and transactional
management policy are separate ports. Future policies may add actions/resources
behind those boundaries while preserving server-side stored authorization.
**There is no RLS in OSS, and none is implemented here.** Future row-level security
belongs exclusively to the SaaS API and Enterprise version, not OSS Core.

## Administrator continuity

The first administrator can assign the built-in Administrator role to any other
enabled human member. Every delegated administrator can manage users and roles,
appoint further administrators and manage the original administrator. Bootstrap
only chooses the first administrator; it does not reserve exclusive authority.
The last-administrator guard refuses removing the final enabled administrator,
not adding another one. The console warns when only one administrator remains
and offers Grant administrator access in another user's access editor.
