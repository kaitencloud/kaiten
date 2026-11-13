# Human users and authorization

The authentication provider identifies people (`sub`, optional name/email) and
supplies the external organization execution context. It does **not** authorize
operations. Core ignores JWT scopes, roles and permissions, including malformed
or wildcard values. Keep Core behind the required validating reverse proxy;
unsigned internal tokens must never be accepted directly from untrusted clients.

## Bootstrap and assignments

The first eligible human JIT sign-in in **each organization** becomes its local
administrator once. Arrival order decides: an invitee may arrive before the creator.
No provider roles, owner selection or provider configuration are used. Additional
administrators must be assigned through local role management. The permanent unique
organization marker and its grant commit with the user and membership. Concurrent
sign-ins elect one winner per organization across backend instances; different
organizations elect independently. Existing uninitialized memberships can win too.
Failed transactions, disabled members, machines and system identities cannot win.
Explicit local assignments (including empty or disabled policies) prevent bootstrap.
The marker survives deletion of the winner, assignments or organization, including
recreation with the same UUID or any retained external-identity alias; it never
reopens on demotion. Supported external-ID rebinds retain both old and new aliases
permanently (A → B → C). Recreating an alias-bound tenant seals its new UUID before
a further rebind can escape that history. Aliases never change historical ownership.

Forward migration `20261101000000` preserves the old global latch and seals every
organization with an existing assignment or (conservatively) custom-role definition.
The migration blocks organization writes, then the legacy latch, then assignment
writes (matching old bootstrap order), before any history snapshot, following
supported writer lock order. Triggers are installed
before copying history; pending old-backend/seeder writes are captured after commit.
A BEFORE-assignment-insert trigger takes the organization lock before assignment
tuple locks, then seals explicit management and demo-seeder grants in that same
transaction. This serializes direct seeder grants with identity rebinds without
inverting management's row-lock order. Marker-insert and organization-insert/rebind
triggers record aliases atomically, including alias-only recreated tenants. New custom-role
definitions alone do not consume bootstrap.
Every local assignment initialization also fills the legacy global latch with its
real user/org IDs if empty, in the same transaction, preserving an existing record
exactly. This prevents still-Ready old pods from electing a second administrator
during rollout. It also covers explicit/demo-seeder assignments and rolls back with
them. The forward migration closes an empty legacy latch from retained assignments
after copying per-org history, without relabeling explicit policies as new winners.
The old latch is compatibility metadata only: the new election never reads
it as a gate, so other organizations still initialize independently.
The applied `20261022000000` migration is unchanged: released #71 backfilled every
live human membership once, excluding machines, system identities, deleted users
and removed memberships. Never replay it to repair access. A zero-assignment
organization without retained initialization evidence can
bootstrap on its next eligible JIT sign-in. If historical grants and their members
were all physically removed before this migration, the old singleton cannot prove
initialization of every other organization. Such missing history must be audited
and sealed by an operator before rollout; this migration cannot reconstruct it.
External-ID aliases discarded before this migration likewise cannot be recovered
from the current organization row; only currently known identities are backfilled.
Downgrading discards per-org history and is not an access-recovery mechanism.

The election runs before a positive JIT identity-cache entry is written. Warm cache
hits do not repeat grants; authorization/liveness still resolves freshly on every
request. The organization lock and subsequent statements assume PostgreSQL's default
READ COMMITTED isolation, as existing management writes do.

Later JIT users in initialized organizations receive no resource permissions until
assigned locally. Every active human can read their own `/api/me` profile and
effective permissions.
`administrator`, `viewer`, and `editor` are immutable built-in templates; custom
roles group organization permissions under stable organization-owned slugs.
Explicit permissions use Core's organization scope vocabulary. User
management uses fresh stored human permissions: `read:users` permits the user
and role directories, and `write:users` permits management (and implies read).
Direct permissions and custom or built-in roles all participate. No additional
administrator role is required. Service tokens, machines and system identities
cannot manage humans, even with users scopes. Assignments and enablement belong
to membership.

Permissions and active-user/membership checks are loaded on **every request**, even
when JIT identity resolution is cached. REST, GraphQL and OFREP use the same
resolved caller grants. Revocation affects the next request with the same JWT;
already-running requests/streams are not retroactively canceled.

## Core API

| Method | Path (under `/api`) | Purpose |
| --- | --- | --- |
| GET | `/me` | Current human profile, roles, effective scopes and vocabulary |
| GET | `/users` | Human directory (`read:users`); `limit` and opaque `cursor` pagination |
| GET | `/users/{id}` | Read a human member (`read:users`) |
| PUT | `/users/{id}` | Replace global display name/email (`write:users`, attenuated) |
| PUT | `/users/{id}/authorization` | Replace `enabled`, `roles`, `permissions` |
| PATCH | `/users/{id}/assignments` | Replace roles/direct scopes while preserving enabled |
| PATCH | `/users/{id}/enabled` | Atomically set enablement, preserving latest assignments |
| GET | `/roles` | Read built-in and organization custom roles (`read:users`) |
| POST | `/roles` | Create custom `{slug,name,description,permissions}`; returns 201 |
| PUT | `/roles/{slug}` | Replace `{name,description,permissions}`; slug stays immutable |
| DELETE | `/roles/{slug}` | Delete an unassigned custom role; returns 204 |

`/me` returns `{user,organizationId,scopes,availableRoles,availablePermissions}`.
`availableRoles` and `/roles` return `Role` objects:
`{slug,name,description,permissions,builtIn,isAdministrator}`. Directory and management UI
capabilities come from effective `read:users` and `write:users` respectively; the
server remains authoritative for delegation checks. `/users` returns `{items,nextCursor?,hasMore}`.

Custom-role permissions and direct user permissions accept only
`scope.OrganizationScopes()` (explicit read/write scopes, no wildcard or
Platform delete scopes). `write:X` implies `read:X`. Assignments name role slugs
and must resolve in the current organization. Definitions are expanded freshly
every request; role edits immediately change access with the same credential.
Unknown/corrupt stored assignments fail closed. Derived role permissions are
never written back as direct user permissions.

Role, assignment, enablement and profile mutations share the organization lock
and recheck the actor's fresh stored `write:users` grants after waiting. Deleting even a disabled user's assigned
role is refused with `409 Users.RoleInUse`; unassign before deletion. Built-in
mutations return `409 Users.BuiltInRole`, duplicate slugs
`409 Users.RoleAlreadyExists`, missing roles `404 Users.RoleNotFound`, invalid
role payloads `400 Users.InvalidRole`, and unknown assignments
`400 Users.InvalidAuthorization`. Only the protected built-in administrator grants `write:*`; custom
roles accept explicit organization permissions only. Credentialed `kaiten.Users` facade methods expose the same policies to
CLI adapters without transport types; no recovery bypass is added.

All management is attenuated: the caller must cover the target's **current and
proposed effective resource authority**, including roles and direct permissions.
`write:X` covers `read:X`; assigning or managing the administrator role requires
an exact held `write:*`, not the union of all explicit scopes. A limited manager
cannot demote, disable or edit a stronger user. Disabled users retain their role
and direct-permission boundary: re-enabling them or clearing their assignments
must not bypass delegation. Profile editing also checks current target authority.

Custom-role creation checks proposed permissions. Updating checks **old and new**
permissions, including metadata-only edits and shrinking a broad role. Role edits
also check each assigned human's current and proposed authority, including disabled
or removed members with retained assignments. Deleting
checks old permissions even when the role is unassigned. This prevents laundering
retained privileges; edits change every assigned user's grants dynamically.
Missing stored permission answers `403 Users.MissingPermission`; authority beyond
the caller's grants answers `403 Users.CannotDelegate`. Invalid stored actor
assignments and revoked/disabled/non-human actors fail closed.

Profile name/email are global across memberships. An authorized human editing them
changes how the same identity appears in other organizations. Once edited locally,
future provider profile claims do not overwrite them. External identity, account
type and membership cannot be rewritten by these endpoints. Disablement blocks
only the current organization's access; authorized managers can re-enable that member within their authority boundary.

Management writes serialize on the organization, recheck the acting human grants
inside the transaction and refuse disabling/demoting its last active administrator
with `409 Users.LastAdministrator`. No global user delete is exposed on Core.
The privileged Platform deletion APIs and direct database operators remain recovery
overrides and can bypass this guard. Recovery after initialization requires explicit
operator provisioning; there is no re-election or provider-admin fallback.

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
