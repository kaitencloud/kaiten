# Service accounts

A service account is a non-human identity that holds API tokens, for automation and SDKs. This feature lists the service accounts with their tokens, creates a service account, creates a token with the scopes the user picks from a table, shows the token's value once, and revokes tokens. A token carries scopes of the form `read:<resource>` and `write:<resource>`.

## Routes

| Path | Route file | What it renders |
| --- | --- | --- |
| `/integrations` | `app/src/routes/integrations/index.tsx` | Redirects to `/integrations/service-accounts` |
| `/integrations/service-accounts` | `app/src/routes/integrations/service-accounts/index.tsx` | `ServiceAccountsPageContent`: the list |
| `/integrations/service-accounts/new` | `app/src/routes/integrations/service-accounts/new/index.tsx` | The same page with `ServiceAccountCreateDialog` open over it |
| `/integrations/service-accounts/$serviceAccountSlug/tokens/new` | `app/src/routes/integrations/service-accounts/$serviceAccountSlug/tokens/new/index.tsx` | `TokenCreatePage`: a page, not a dialog |

`app/src/routes/integrations/service-accounts/route.tsx` is the layout of the section. It loads the list (`serviceAccountsQueryOptions`) and renders the outlet. The new-token route ensures the account in `beforeLoad` (`serviceAccountQueryOptions(serviceAccountSlug)`), which also sets the breadcrumb to the account's name. The account dialog follows [dialog via route](../../../docs/03-patterns/dialog-via-route.md).

Service accounts are the first entry of the Integrations group of the side navigation (`integrationsSubRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`). `webhooks` and `connectors` are the other entries, in their own features.

## Structure

```txt
app/src/features/service-accounts/
├── components/
│   ├── service-accounts-page-content.tsx      # the list page; renders children (the route's dialog)
│   ├── service-account-list/                  # filters, one accordion item per account
│   ├── token-list/                            # tokens of one account, revoke action
│   ├── create-dialog.tsx                      # CreateServiceAccountDialog: the form, no mutation
│   ├── service-account-create-dialog.tsx      # the same dialog wired to the create mutation
│   ├── token-create/                          # new token: page, form, cards, scope table
│   │   ├── token-create-page.tsx              # the form, then the created token
│   │   ├── token-create-form.tsx              # page layout: details, access, actions
│   │   ├── use-token-create-form.ts           # form state and submit
│   │   ├── token-create.schema.ts             # form schema
│   │   ├── token-details-card.tsx             # name, expiration
│   │   ├── token-access-card.tsx              # presets, scope table, summary
│   │   ├── token-presets.tsx                  # Data plane and Control plane shortcuts
│   │   ├── scope-access-table.tsx             # one row per resource: no access, read, read & write
│   │   ├── scope-access-dialog.tsx            # the same table in a dialog, on short viewports
│   │   └── token-created-view.tsx             # the token's value, shown once
│   ├── stories/
│   └── index.ts
├── hooks/use-service-accounts-mutations.ts    # create account, create token, revoke token
├── queries/service-accounts-query-options.ts  # list and single account
├── types/index.ts                             # ResourceType, AccessLevels, groups, presets
├── utils/
│   ├── constants.ts                           # resources, groups, presets
│   └── access-levels.ts                       # levels to scopes, preset arithmetic
└── index.ts
```

## Data

- `serviceAccountsQueryOptions` is the generated `getServiceAccountsOptions()` (`GET /service-accounts`). Each account carries its tokens, so the list reads them from there. `serviceAccountQueryOptions(serviceAccountSlug)` is the generated `getServiceAccountOptions` for one account.
- `useServiceAccountsMutations` (`app/src/features/service-accounts/hooks/use-service-accounts-mutations.ts`) wraps the generated `createServiceAccountMutation` and `deleteServiceAccountTokenMutation` (the "revoke" action). `useCreateServiceAccountToken(serviceAccountSlug)` wraps `createServiceAccountTokenMutation`.
- After each write, the hooks invalidate `getServiceAccountsQueryKey()`. A token write also invalidates `getServiceAccountQueryKey` for that account, because the account the new-token route loaded embeds its tokens too.
- A failed write shows a toast with `getApiErrorMessage`. Revoking a token also shows a success toast.
- The token's value comes back once, in the create mutation's data. `useCreateServiceAccountToken` sets `gcTime: 0`, so the mutation, and the value with it, is dropped as soon as the page is left. The value is never in the query cache or the URL, and a reload loses it by design.

## Behaviour

- **List.** One card per account, an accordion with the name, the number of tokens and the creation date. The name filter is pinned; "has active tokens" and "has revoked tokens" are in the filter builder. The filters reset when the data changes. See [`functionals/filters`](../../functionals/filters/README.md) and [`functionals/table`](../../functionals/table/README.md) (`FilterTableLayout`). With no account the page shows an empty state, and with no match a "No results" message.
- **Account actions.** "Generate token" opens the new-token page of that account. The trash button of an account is not wired to the API: its handler (`handleDeleteServiceAccount`) only logs a warning, and the API has no operation to delete a service account.
- **Create an account.** The dialog has one required field, the name. Submitting closes the dialog at once and returns to the list; the create runs in the background, and a failure shows a toast.
- **Tokens of an account.** A toggle filters them All, Active or Revoked, with counts, and opens on Active. A token shows its name, a badge (revoked, expired, or the expiry date), its scopes as badges (write in the strong variant, read in the secondary one), who created it and who revoked it, with dates. "Revoke" asks for confirmation and disappears once the token is revoked or expired; those tokens are dimmed.
- **New token.** Two cards. Details: a required name and an optional expiration date, sent as an ISO 8601 timestamp. Access: a table with one row per resource, grouped as Customers, Licensing, Feature Flags, Releases and Organization, each set to No access, Read or Read & write. Below it, a summary lists the scopes that will be sent, and "Clear" resets the table. On a short viewport the table opens in a dialog (`ScopeAccessDialog`) instead of sitting in the page. The form refuses an empty name and a table with no access. A note beside the create button says the value is shown once.
- **Levels and scopes.** A level sends the scopes it names, sorted: Read & write is both `read:<resource>` and `write:<resource>`. The API would accept `write:` alone for both, but the table says "Read & write", so the summary, the request and the token's own scope list say the same (`accessLevelsToScopes`).
- **Presets.** `TOKEN_PRESETS` are shortcuts over the table, not token types: the API knows scopes only. A preset reads as applied whenever the table covers it, and taking it out lowers only what the presets still applied do not need. What a preset grants is rendered from its data, never from a translation.
  - Data plane, for an SDK inside the product: read on feature flags, customers, licenses and entitlements, and read & write on instances (usage reports are written under an instance).
  - Control plane, for automation that runs the fleet: read & write on instances, licenses, customers, deployment zones, releases, components, organizations and tokens.
- **Created token.** After the create, the same route shows `TokenCreatedView` from the mutation's result: the value in a read-only field with a copy button, the scopes and the expiry. "Done" returns to the list. Cancel on the form returns to the list too.

## Where the scopes come from

Nothing in the feature lists them by hand:

1. `api/pkg/scope` declares every module. `scope.OrganizationScopes()` is read and write on each module an organization credential can hold, which is all of them except `users` and `memberships`, enforced only by the Platform API.
2. The Core OpenAPI document publishes that list on its `bearerAuth` scheme, as `x-kaiten-scopes`. A module can be enforced by a service in front of the API rather than by one of its operations (`webhooks` today); the list includes it. The contract tests in `api/internal/infrastructure/http/server/openapi_contract_test.go` check that every Core operation's scope is on the list and that every listed module is enforced somewhere, by an operation or by a service recorded in the test.
3. `packages/api-codegen/generate-scopes.js` turns the list into `app/src/lib/api/scopes.gen.ts` when `pnpm run generate` runs in `app/`.
4. `app/src/features/service-accounts/utils/constants.ts` builds `AVAILABLE_RESOURCES` from it.

The table cannot miss a scope: a token is minted only with scopes `pkg/scope` accepts, so no other place can add one. A new scope still needs three things from the console:

- a group, in `RESOURCE_GROUPS` (`app/src/features/service-accounts/utils/constants.ts`), a `Record` over the generated type, so the type check fails until one is chosen;
- a label and a description in `app/src/lib/i18n/locales/en.ts` and `fr.ts`, under `Pages.Integrations.ServiceAccounts.Scopes.Resources`, which `app/src/features/service-accounts/utils/__tests__/constants.test.ts` requires. The same test requires a label for each group and a label and description for each preset.
- for the scope of a feature not every organization is served, a check in the picker. Webhooks is the one (`WEBHOOKS_SCOPE_RESOURCE` in `app/src/features/service-accounts/utils/constants.ts`): served by saas-api on Kaiten Cloud alone, and only to an organization whose licence carries them, the picker offers it only where `useWebhooksServed()` (`@/domains/webhooks`) says they are. On a self-hosted deployment there are no webhooks to call.

## Tests

- Unit and component tests (Vitest): `app/src/features/service-accounts/components/service-account-list/service-account-list.test.tsx`, `components/token-create/__tests__/` (`token-create-form.test.tsx`, `token-created-view.test.tsx`), `hooks/__tests__/use-create-service-account-token.test.tsx`, and `utils/__tests__/` (`access-levels.test.ts`, `constants.test.ts`), all under `app/src/features/service-accounts/`.
- Stories in `app/src/features/service-accounts/components/stories/`: `Features/ServiceAccounts/ServiceAccountList` (`Default`, `Empty`, `SingleAccountWithTokens`, `AccountWithNoTokens`, `ManyAccounts`), `TokenListItem` (one story per token state), `NewToken` (`Form`, `Created`) and `CreateServiceAccountDialog` (`Default`, `Pending`). The visual regression suite does not cover these stories.
- E2E: none. No spec in `app/e2e/app/` covers this feature.

## Public API

`app/src/features/service-accounts/index.ts` exports `ServiceAccountsPageContent`, `ServiceAccountCreateDialog`, `TokenCreatePage`, `serviceAccountsQueryOptions` and `serviceAccountQueryOptions`. Only the routes under `app/src/routes/integrations/service-accounts/` import them, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)). Inside the feature, import from the module itself.
