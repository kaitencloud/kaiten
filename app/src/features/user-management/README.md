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
