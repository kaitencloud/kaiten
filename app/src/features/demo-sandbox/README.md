# Demo sandbox

For an organization that the `demo-sandbox` flag marks as a demo sandbox, the console shows a warning strip above the header and a card in Settings. A user seeds the organization with demo data from either of them, and resets it from the card. Nothing renders for any other organization, and the feature's code is not even downloaded for it.

## Routes

The feature has no route of its own. Two routes mount it, each behind the flag:

| Where | Route file | Mounts |
| --- | --- | --- |
| Above the header of every page | `app/src/routes/__root.tsx` | `DemoBanner` |
| The `/settings` page, after its built-in sections | `app/src/routes/settings/index.tsx` | `DemoSettingsCard` |

Both routes import the feature with a dynamic `import('@/features/demo-sandbox')` inside `lazy()`, and render the component only when `useDemoSandboxEnabled()` is true. The settings route passes the card as a child of `SettingsPageContent`: a feature does not import another feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)), so the route composes them.

## Structure

```txt
app/src/features/demo-sandbox/
├── index.ts                  # exports DemoBanner and DemoSettingsCard
├── demo-sandbox.api.ts       # the three hand-written calls
├── components/
│   ├── demo-banner.tsx       # the warning strip
│   └── demo-settings-card.tsx  # the Settings card, with the reset confirmation
├── hooks/                    # useDemoStatus, useSeedDemoData, useResetDemoData
└── types/                    # DemoStatus, DemoSeedResult, DemoResetResult
```

## Data

Three endpoints, called by hand through the shared `client` (`@/api-client/client.gen`), with local types. `app/openapi.yaml` does not describe them, and no module under `api/` serves them; the header of `docker/envoy/kaiten.yaml.tmpl` lists `/api/demo` among the paths the stack in this repository does not route. `lib/api/bootstrap.ts` initializes the shared transport before routes, including its base URL, current bearer token and `ApiError` wrapping. See [Generated code](../../../docs/AI_CONTEXT.md#generated-code).

| Call | Request | Used by |
| --- | --- | --- |
| `getDemoStatus` | `GET /demo/status`, typed as returning `{ is_demo, seeded, seeding }` | `useDemoStatus` |
| `seedDemoData` | `POST /demo/seed` | `useSeedDemoData` |
| `resetDemoData` | `POST /demo/reset` | `useResetDemoData` |

`useDemoStatus` uses the query key `['demo-sandbox', 'demo-status']` and refetches every 5 seconds while `seeding` is true, so both components notice the end of a run without a reload. Seed and reset only start a run: the components show progress from `seeding` in the status. Both mutations invalidate the status key and show a "started" toast on success. Both hooks read a `409` as "a run is already going", for example after a double click or from another tab: they show an informational toast, not an error. Any other error shows `toast.error(getApiErrorMessage(error))`.

## Behaviour

**The flag.** `useDemoSandboxEnabled()` (`app/src/hooks/use-feature-flag.ts`) reads the boolean flag `demo-sandbox` through `demoSandboxFlagQueryOptions` (`app/src/lib/feature-flags.ts`). The flag is evaluated with OpenFeature's OFREP web provider. The hook returns `false` while the evaluation is in flight, and the evaluation fails closed: an error, a missing credential or a missing organization all read as off, without a retry. Where the flag is read from depends on the build:

- With both `VITE_KAITEN_PLATFORM_API_URL` and `VITE_KAITEN_PLATFORM_FLAGS_TOKEN` set, from that API, with that token, for the signed-in organization.
- Otherwise, on the dev server and in the `VITE_LOCAL_AUTH` and `VITE_E2E_BYPASS_AUTH` builds, from the app's own API (`VITE_API_URL`), as the signed-in user.
- In any other build, nowhere: the flag is off and the feature never mounts.

The two variables are documented in [environments](../../../docs/07-deployment/environments.md). The targeting rule of the flag lives where the flag is defined, not in this repository.

**Second gate.** `DemoBanner` and `DemoSettingsCard` also render nothing unless `GET /demo/status` answers `is_demo: true`. If nothing answers the endpoint, the query fails, `data` stays empty and both render nothing.

**Banner.** A warning strip with a flask icon. While a run is going, it shows a spinner and "Seeding demo data…". If the organization has never been seeded, it offers a "Seed demo data" button. Once seeded, it links to `/settings` ("Manage demo data in Settings").

**Settings card.** A never-seeded sandbox has a "Seed demo data" button that fires at once, since there is nothing to lose yet. A seeded one has a "Reset demo data" button behind an `AlertDialog`, because a reset destroys the organization's current data. While a run is going, the button is disabled and shows a spinner.

## Tests

- None in the feature: no unit test, no story and no E2E spec.
- The flag's evaluation is unit-tested in `app/src/lib/__tests__/feature-flags.test.ts` (both flag sources, the fail-closed cases, the re-registration when the organization changes), and the resolution of the two variables in `app/src/__tests__/env.test.ts`.

## Public API

`app/src/features/demo-sandbox/index.ts` exports `DemoBanner` and `DemoSettingsCard`. Only the two routes above import them, through the dynamic import described under [Routes](#routes), as routes are the only importers of a feature. The three hooks are exported from `hooks/index.ts` for the feature's own use and are not part of the public API.
