# Human users and authorization

The authentication provider identifies people (`sub`, optional name/email) and
supplies the external organization execution context. It does **not** authorize
operations. Core ignores JWT scopes, roles and permissions, including malformed
or wildcard values. Keep Core behind the required validating reverse proxy;
unsigned internal tokens must never be accepted directly from untrusted clients.

## Bootstrap and assignments

The first successful human sign-in wins a **deployment-wide** bootstrap election
and becomes administrator **in the organization they signed into**. This preserves
Core's existing organization boundary; it does not grant cross-organization
Platform authority. A unique singleton row and its role grant commit in the same
transaction as the user and membership. Concurrent sign-ins elect one winner;
failed transactions, disabled members, machines and system identities cannot win.
The marker survives deletion of the winner or organization and never reboots.

Later JIT users (and existing users on upgrade) receive no resource permissions
until assigned locally. Every active human can read their own `/api/me` profile
and effective permissions. Roles are built-ins: `administrator`, `viewer`, and
`editor`. Explicit permissions use Core's organization scope vocabulary. User
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
