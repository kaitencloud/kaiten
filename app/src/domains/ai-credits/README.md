# AI credits domain

What the AI screens of three features share: the access decision, the pricing engine, the rate-card read and the settings kept in the browser. The pages stay in their features (`features/ai`, `features/instances`, `features/entitlements`); the domain owns no route. It is imported as `@/domains/ai-credits`, whose `index.ts` exports every name explicitly.

## Structure

```txt
app/src/domains/ai-credits/
├── index.ts                    the public API, by name
├── pricing/                    the pricing engine: pure, no React, no request, no text
├── rate-card/                  the AiRateCard read and what the pool and model screens derive from it
├── pricing-local-settings.ts   the value of a credit and the reference calls, kept in the browser
├── ai-access.ts, use-ai-access.ts, ai-availability.tsx, ai-request-guard.ts   the access decision
├── ai-capabilities.api.ts      GET /ai/capabilities, until the contract generates it
├── ai-query-options.ts         the model catalogue read and invalidateAiQueries
├── model-writes.ts             a model's writes outside its form: an external id, archiving; the suggestion of a model for a name
├── ai-navigation.tsx           the entitlement context of the model pages and the way back
└── ai-fields.tsx, ai-section.tsx, form-details.tsx   form fields and read states the AI forms share
```

## Pricing engine (`pricing/`)

The arithmetic and the rule resolution of the API (`api/internal/modules/instances/usage/aicredit`), mirrored so that the console can show a price before a call is made. It returns numbers and codes; the screens format and translate. The API is the authority: what it charges is what the inference row stores.

| Function | What it gives |
| --- | --- |
| `priceUsage(terms, usage, status)` | The credits of one call: a line per priced dimension, the computed amount, the charged amount after the error policy, the minimum and the maximum, and whether a bound applied. |
| `resolveRule`, `resolveLadder(rules, model, requestType)` | The rule that prices a model on a version, and the four levels it was resolved through: exact model and type, exact model and any type, any model and the type, any model and any type. |
| `vendorCost(costs, usage)` | The vendor cost of a call in USD from the catalogue's rates, and which dimensions have no cost. |
| `costPerCredit`, `margin` | Vendor cost divided by credits; `1 − cost per credit ÷ value of a credit`. |
| `buildRateCardCell(...)` | One cell of the rate card: its state, the rule, the ladder, the price of the reference call, the cost per credit and the margin. |
| `wildcardCoverage(...)` | The models a wildcard rule prices today on a version. |
| `reconstructReceipt(...)` | Whether the arithmetic of a past charge may be shown, and with what (see below). |
| `refundableCredits`, `refundAmountIssue` | What a charge still has to give back (`charged − refunded`), and why an amount cannot be refunded. |
| `vendorCostDrift` | How far the vendor cost the caller reported is from the one computed from the catalogue. |
| `previewCalls`, `DEFAULT_REFERENCE_CALLS`, `validateReferenceCall` | The reference call of each request type and the small and large calls of the preview. |

Rules the engine keeps, each with a test ported from the Go package (`pricing/__tests__/`):

- Amounts are exact decimals (BigInt fixed point), never floats. A rate has up to 10 decimals, a credit amount 6, rounded half-up once, after the bounds.
- A blank cache-read or cache-write rate inherits the input-token rate; an explicit `0` is free. Any other blank rate is unpriced.
- When no priced dimension has a reported quantity, the computed amount is the rule's minimum and the result says the input was missing.
- The error policy decides whether a failed call is charged: `NOT_SENT` never; `CUSTOMER_ERROR` only under `ALWAYS`; `PROVIDER_ERROR` under `ALWAYS` or `PROVIDER_ERROR_ONLY`.
- An unknown or archived model is never priced, even by a wildcard. A deprecated model is priced, with a warning.
- The server does not restrict a request type by modality. `requestTypesForModality` is a display heuristic for the tabs only.

The golden values are ported, not fetched: no test compares the engine with a running API.

## Receipt of a past charge

An inference row stores the amounts (`reserved`, `computed`, `charged`), the usage and, since the API records it, the pricing applied at commit (`pricing`: rule id, level, rates, bounds, error policy). Rows recorded before that have no snapshot. `reconstructReceipt` answers one of three things, and the receipt shows arithmetic only for the first two:

- `SNAPSHOT`: the row carries the pricing applied at commit. The arithmetic is that of the snapshot, whatever the rule says today. The normal case.
- `MATCHES` (older rows only): the rule fetched by its id is on the row's licence version, was not edited after the commit, and recomputing with it gives exactly the stored amounts. The arithmetic is shown as recomputed from the rule as it stands today.
- `CANNOT_RECONSTRUCT`, with a reason (rule edited after the commit, rule not found, rule on another version, amounts differ, not committed, not authorized, not recomputable). No arithmetic is shown: the stored amounts are the facts.

A reconstruction is never proof of what was applied; only the stored amounts and a snapshot are.

## Rate-card read (`rate-card/`)

- `aiRateCardQueryOptions`: every licence version with its number, the version its family serves, what it grants and its active rules (with `grantedByAddons` and their authors), one GraphQL document (`AiRateCard`, in `rate-card.queries.ts`) paged by 150 versions: a page of 200 would cost more than the dearest document the console sends, which the API's complexity test pins. Key `aiRateCardQueryKey`.
- `aiAddonGrantsQueryOptions`, `useAddonGrants`: what add-on versions can grant of a pool on a licence family (`AiAddonGrants`), a document of its own because the API refuses it where billing is off (`Billing.Disabled`) or without `read:addons`. A refusal is an answer (`UNREADABLE`, with the reason), not an error; a session whose token lacks the scope is not asked. `AddonGrantPopover` and `AddonGrantDetails` show it, with the sentence that an add-on can grant the pool to an instance and that not every instance holds it.
- `summarisePoolPricing`, `poolGrantOf`: the rows of a pool's Pricing tab.
- `wildcardImpactOf`: the wildcard rules that will price a new model of a modality.

`invalidateAiQueries(client)` (`ai-query-options.ts`) clears the model list, each model, the REST lists of rules and the rate-card key. Every rule and model write calls it. The licence writes and the deletion of a credit pool clear `aiRateCardQueryKey` themselves.

## Model writes (`model-writes.ts`)

`addModelExternalId(slug, id)` and `archiveModel(slug)` read the model again from the API and write the change over what it holds now, since the API replaces a model as a whole. `suggestModelFor(name, models)` proposes the catalogue model a name most likely means: the vendor prefix is dropped, punctuation is read as a dash, and the model whose slug or external id the name starts with wins, the longest one; no suggestion for a tie or an archived model.

## Settings kept in the browser

`pricing-local-settings.ts` is a TanStack DB collection in local storage, key `kaiten:ai-pricing`, one record per pool (`pool:<slug>`, the value of a credit in USD) and per request type (`reference:<type>`, the reference call). The rate card writes them (`setLocalCreditValue`, `setLocalReferenceCall`); the rate card and the receipt read them (`useLocalCreditValue`). The API has no field for either yet, so they are not saved to Kaiten and differ from one browser to the next; the screens label them so. A storage that cannot be written falls back to memory.

## Access

One decision for every AI surface: the authenticated `GET /ai/capabilities` must answer `enabled: true` **and** the platform flag `ai-credits` must evaluate to true.

- `requireAiAccess(queryClient)` guards a route: it reads a fresh answer and throws not found otherwise.
- `useAiAccess()` gives `available`, `isPending` and `allows(operation)`, which adds the scope of a generated operation. `AiAvailability` renders nothing while access is off or was never granted.
- Once granted in the session, a stale, refreshing or failing check keeps the last positive answer: screens stay mounted and requests are admitted. An explicit negative revokes: the flag or the capability answering false, a 401 or 403, an `AIUsage.Disabled` refusal, an OpenFeature provider error or stale event. Revocation cancels and removes the AI query data (`ai-request-guard.ts`).
- A snapshot is fresh for 30 seconds (`AI_ACCESS_FRESHNESS_MS`) and refreshed on focus and reconnect; when it expires the check is read again rather than revoked.

The API enforces access on its own; this is not a kill switch.
