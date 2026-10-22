# Users and roles

`/settings/access` manages active human memberships in the current organization.
Users and Roles tabs, filters and editors are URL-backed (`tab`, `q`, `status`,
`manageUser`, `manageRole`, `createRole`) so navigation and browser back keep context.

Core's current stored scopes control this console: `read:users` opens the directory
and read-only details; `write:users` enables management. Both can come from custom
role groups. No JWT claims are read. Editing and delegation require the caller
to hold the target's current and requested authority; higher-privilege targets
and unowned grants are read-only/unavailable. The protected Administrator role
still grants full access. Loading, errors and missing editor targets are explicit.

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

## Administrator continuity

The first administrator can assign the built-in Administrator role to any other
enabled human member. Every delegated administrator can manage users and roles,
appoint further administrators and manage the original administrator. Bootstrap
only chooses the first administrator; it does not reserve exclusive authority.
The last-administrator guard refuses removing the final enabled administrator,
not adding another one. The console warns when only one administrator remains
and offers Grant administrator access in another user's access editor.
