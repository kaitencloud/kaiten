# Shared hooks

Generic hooks compose form primitives, browser state and shared infrastructure.
Feature-specific mutation and view-model hooks stay in their feature.

`use-feature-flag.ts` is a platform bridge shared by the app shell, settings and
token scope selection. It reads the same QueryClient entries as route guards;
the product flag vocabulary and provider lifecycle are owned by
`lib/feature-flags.ts`. `use-app-settings.ts` bridges persisted settings.
The side-navigation viewport lock is private to `routes/-components/side-nav`.
