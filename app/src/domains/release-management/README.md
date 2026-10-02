# Release management

Shared business code used by releases, components, deployment zones and instances.
The domain owns read models, queries, release/zone presentation and component
catalog forms. Pages and routes remain with their features.

`components/release-management-page-shell.tsx` provides the workspace UI consumed
directly by the three list features. Its internal tabs own the workspace URLs and
translations; it uses the generic Page and RouteTabs functionals. The public
domain entry point exports the shell, not its tab implementation.

`component-catalog/`, `logic/`, `queries/` and `types/` retain their responsibilities.
The release-management E2E pack verifies navigation, deployment and state read
back across features. Shell stories keep stable IDs for visual captures.
