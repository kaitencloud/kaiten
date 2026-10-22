# Users and roles

`/settings/access` manages active human memberships in the current organization.
Users and Roles tabs, filters and editors are URL-backed (`tab`, `q`, `status`,
`manageUser`, `manageRole`, `createRole`) so navigation and browser back keep context.

Only Core's enabled stored Administrator role unlocks management. No JWT claims
are read, and broad scopes alone never grant administrator capability. Non-admins
see an explanation; loading, request failures and missing editor targets are explicit.

Users have locally managed global name/email, assigned named roles, additive direct
scopes and separate organization enablement. The role matrix shows None/Read/Read &
write; None removes only the direct grant, not inherited access. Role definitions
are editable scope groups; built-in system templates are read-only. Deleting an
assigned role and demoting/disabling the last administrator are refused server-side.

Generated REST operations and schemas own the contract. Mutations invalidate users,
roles and `/me`, including failed attempts, to refresh the server's current state.
Enablement and assignment edits each use atomic PATCH. Status changes preserve roles, and role edits preserve current enablement, so concurrent administrator changes cannot silently re-enable a disabled member.
Local development shows a current Core-verified Administrator/Member header badge,
not a role label inferred from the development token file.

Tests cover route normalization, permission inheritance/matrix transformations,
contract validation, filtering, conflict explanations and query invalidation.

## Form refinements

Role details show the immutable identifier below Name as read-only metadata; new
roles use an aligned full-width identifier input. User profile email is explicitly
required and uses email keyboard/autocomplete semantics. Editors protect dirty
changes on Close, Escape and backdrop dismissal, and wait for access mutations
to finish. Saving access leaves the drawer open and preserves unsaved profile
changes. Confirmation labels name their action and distinguish deletion from
ordinary access updates; role/direct-scope changes are summarized before saving.

Effective access is shown by resource, including role/direct provenance;
administrator authority is described as full access rather than one wildcard
scope. Error summaries receive focus, lazy form fields reserve loading space,
and editor motion honors reduced-motion preferences. Permission controls keep
compact desktop sizing while increasing coarse-pointer targets.
