# Shared hooks

Generic hooks compose form primitives, browser state and shared infrastructure.
Feature-specific mutation and view-model hooks stay in their feature.

`use-feature-flag.ts` is a platform bridge shared by the app shell, settings and
token scope selection. It reads the same QueryClient entries as route guards;
the product flag vocabulary and provider lifecycle are owned by
`lib/feature-flags.ts`. `use-app-settings.ts` bridges persisted settings.
The side-navigation viewport lock is private to `routes/-components/side-nav`.

`use-form-recovery-startup.ts` runs the prune of the stored input of creation
forms once the person is known: what expired and what another user of the
browser left (`lib/form-recovery`). The signed-in shell calls it; accounts
without a provider run the same prune from `main.tsx` before the first render.

`use-focus-leave.ts` tells when focus leaves a control made of several elements,
popups that sit elsewhere in the DOM included (`DateTimePicker`, `TimeField`).
It decides one task after the focus moves, so a move from one part to another,
or a popup handing the focus back, is not a leave.

`use-single-flight.ts` lets an action that is not a form submit run once at a
time: `useSingleFlight` for a promise, `useSingleFlightMutate` for a mutation
fired with `mutate`, which it takes as `mutateAsync` so that the guard follows the promise and not a callback the query library may drop. A button guarded by `disabled={isPending}` alone sends two
requests for two clicks of the same frame, since the pending state is painted a
frame after the click; the guard is a ref, set before the request starts.
