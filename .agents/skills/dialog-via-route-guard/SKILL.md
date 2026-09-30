---
name: dialog-via-route-guard
description: Implement and verify route-driven dialog flows with TanStack Router. Use when adding create or edit dialogs controlled by URL and preventing page flash during dialog navigation.
---

# Dialog Via Route Guard

Implement URL-driven dialogs with stable UX and no loading flash.

## Workflow

1. Read pattern references:
   - `app/docs/03-patterns/dialog-via-route.md`
   - `app/docs/03-patterns/routes-as-assemblers.md`
2. Select route structure:
   - Full layout route with parent page + dialog outlet, or minimal layout wrapper.
3. Ensure parent route keeps context alive:
   - Use layout `route.tsx`, `Outlet`, and `Suspense fallback={null}`.
4. Ensure dialog route behavior:
   - Use `pendingComponent: () => null` where needed.
   - Close dialog by navigation back to parent route.
5. Keep route responsibilities thin:
   - Use loader/prefetch and delegate dialog content to feature components.
6. Verify deep-link and refresh behavior on dialog URLs.

## Useful commands

```bash
rg -n "createFileRoute\('/.*(new|edit)" app/src/routes
rg -n "pendingComponent|Suspense|Outlet|onOpenChange" app/src/routes app/src/features
```

## Output

- Confirm chosen pattern and rationale.
- List required route and feature changes.
- Flag flash-risk gaps and deep-link regressions.
