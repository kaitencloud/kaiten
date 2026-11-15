# AI credits

The AI area of the console, shown where AI credits are on for the organization. A product manager prices the calls made to AI models in credits: the **rate card** shows, for a credit pool, what a reference call costs on each licence version for each model, where that price comes from and what a credit costs at the vendor; a panel beside it creates, edits and archives the rules. The **model catalogue** lists the models that can be priced, with their vendor costs.

The other AI screens live in the features that own their pages: the AI usage tab and the charge receipt of an instance ([`instances`](../instances/README.md#ai-usage)), the Pricing tab of a credit pool ([`entitlements`](../entitlements/README.md#credit-pool-pricing-tab)). What they share is the domain [`ai-credits`](../../domains/ai-credits/README.md).

## Routes

| URL | Route file | Renders |
| --- | --- | --- |
| `/ai` | `routes/ai/route.tsx`, `routes/ai/index.tsx` | The guard of the area (`requireAiAccess`), then a redirect to `/ai/pricing`. |
| `/ai/pricing` | `routes/ai/pricing/index.tsx` | `PricingPage`: the rate card and, when `?cell=` names one, the rule panel. |
| `/ai/models` | `routes/ai/models/route.tsx`, `index.tsx` | `AiCatalogueLayout` around `ModelsPage`. |
| `/ai/models/new`, `/ai/models/$modelSlug/edit` | `routes/ai/models/new.tsx`, `$modelSlug/edit.tsx` | `ModelEditorPage`. |
| `/ai/models/import` | `routes/ai/models/import.tsx` | `ModelImportPage` (OpenRouter). |
| `/ai/models/$modelSlug/source` | `routes/ai/models/$modelSlug/source.tsx` | `ModelSourcePage`. |
| `/ai/matrix` | `routes/ai/matrix/index.tsx` | A redirect to `/ai/pricing`: `entitlementSlug` becomes `pool`, `licenseSlug` becomes `version`. |
| `/catalog/models…` | `routes/catalog/models/*` | Redirects to the same page under `/ai/models`, params and search kept. |

The search of `/ai/pricing` is read by `readPricingSearch` (`pricing/pricing-search.schema.ts`): `pool`, `family` (`current` or a family slug), `version` (a licence version, resolved to its family), `type` (request type), `q`, `status` (`active` or `all`) and `cell` (`<licenceSlug>~<modelSlug>`, or `<licenceSlug>~*` for the wildcard row: `*` cannot be a model's slug). A field that does not read is dropped and the page opens with the rest, so a link always opens something.

## Structure

```txt
app/src/features/ai/
├── index.ts                  what the routes import
├── ai-catalogue-layout.tsx   the frame of the model pages, with the way back to an entitlement
├── models/                   the catalogue, the model form, the OpenRouter import and source check
└── pricing/
    ├── pricing-page.tsx      access states, skeleton, the page header
    ├── pricing-rate-card.tsx the toolbar, the tabs, the grid and the panel, around the URL
    ├── use-rate-card.ts      joins the reads (pools, models, rate card, add-on grants) and the browser settings into the view
    ├── rate-card-model.ts    pure: families, versions in view, vendor groups, the `cell` reference
    ├── rate-card-*.tsx       the grid, its headers, a cell, the wildcard row, the empty states
    ├── reference-call-*.ts(x) the reference call of a request type and its dialog
    ├── use-dirty-guard.ts    keeps unsent changes: in-page clicks, the router's blocker, beforeunload
    ├── reveal-cell.ts        brings the cell of the open panel into view inside the grid's scroller
    ├── engine.ts             what the feature takes from the domain's pricing engine
    └── panel/                the rule panel: ladder, states, rule form, preview, writes
```

## Data

- **Pools**: `allEntitlementsOptions()` (REST `listEntitlements`), filtered to `NUMBER_AI_CREDIT`.
- **Models and vendor costs**: `modelsQueryOptions` of the domain (REST `listModels`, every page). The graph has no vendor cost.
- **Versions, grants and rules**: `aiRateCardQueryOptions` of the domain, one GraphQL document (`AiRateCard`) that pages `licenses` (150 at a time) with each version's number in its family, the version its family serves, what it grants and its active rules with their authors. The number of requests follows the pages of versions, never the versions.
- **Add-on grants**: `useAddonGrants` of the domain, a document of its own (`AiAddonGrants`) per licence family in view. The API refuses it where billing is off or the session lacks `read:addons`; the rate card then shows what the rules already say (`grantedByAddons`) and why the add-ons are not listed.
- **Writes**: `createConversionRule`, `updateConversionRule` and `archiveConversionRule` in `panel/use-rule-writes.ts`. An update re-reads the rule and sends only what the form changed (`writeOnFresh`), since the API replaces a rule as a whole. Models are written by `models/` with the generated mutations, also through a fresh read.
- **Invalidation**: every write of a rule or a model calls `invalidateAiQueries` (domain), which clears the model list, each model, the REST lists of rules and the rate-card key (the add-on grants sit under that key). The licence writes clear the rate-card key too (`features/licenses/queries/license-query-options.ts`), since the read carries the versions and their grants; so does the deletion of a credit pool, whose rules go with it. Creating or editing a pool changes nothing the read holds.
- **Kept in the browser**: the value of a credit per pool and the reference call per request type (`pricing-local-settings.ts` in the domain). See [Behaviour](#behaviour).

Every number on these screens comes out of the domain's pricing engine: no component adds, multiplies or rounds a price.

## Behaviour

### Access

- The `/ai` route guards the area: the deployment capability (`GET /ai/capabilities`) **and** the platform flag `ai-credits` must both be true. With either off, the navigation has no AI section, the AI routes answer not found (the page offers the way home, not a link into the area), and the entitlement form has no Credits type.
- Once access was granted in the session, a stale, refreshing or failing check (a background tab, a network blip) keeps the screens mounted on the last answer, admits AI requests and never aborts one in flight. Only an explicit negative (flag or capability false, a 401/403 or an `AIUsage.Disabled` refusal) tears them down. Route guards still require a fresh positive answer. The API enforces its own policy independently of the console.
- Scopes still apply. Pricing is listed in the navigation with `listConversionRules` and `listModels`, Models with `listModels`. The rate card needs entitlement, model and licence reads; a session that may not write sees the panel read-only. Model pages need model reads, their editors model writes.

### Rate card

- A family has no name of its own: it goes by the name of the version it serves (`family.currentVersion`, its default or its highest-numbered published version), else of its highest-numbered version. "Current version of each family" shows that served version. The columns of a family follow `versionNumber`.
- A column is a licence version of the family in view; a row is a model, grouped by vendor, plus one row for the wildcard rules ("Any model"). The tabs are the request types the catalogue's models show (a display heuristic by modality: the server prices any request type a rule names).
- A cell shows the credits charged for the **reference call** of the tab, the cost per credit (vendor cost of that call divided by the credits) and where the price comes from:
  - **Own rule**: a rule that names the model, for this request type or for any.
  - **Via a wildcard**: no rule names the model; an "any model" rule prices it.
  - **Not priced**: the version grants the pool and no rule prices the model: calls are refused.
  - **Through add-on**: the version does not grant the pool and an add-on version compatible with its family can. The column head, the cells and the panel say so with the add-on's name, and the head opens the add-on versions (state, what each grants, the default one). It says an add-on *can* grant the pool to an instance on the family's versions; it does not say every instance holds it. Where the licence grants the pool too, the head adds a short "+ add-on".
  - **Pool not granted**: neither the version nor an add-on grants the pool; its rules price only instances that get the pool another way (a boost, an exception).
  - **Not chargeable**: the model is archived. A deprecated model is still priced, with a badge.
- Resolution follows the server: exact model and request type, then exact model and any type, then any model and the request type, then any model and any type. One whole rule wins; rates never merge across rules. Unknown and archived models are never priced, even by a wildcard.
- The **reference call** is one call per request type (1,500 input and 500 output tokens for a completion by default) that every cell and the panel price, so that prices compare. It can be changed per request type.
- Where the catalogue costs part of the reference call only (an input cost and no output cost), the cell, the rule preview and the breakdown say "partial vendor cost" and give neither a cost per credit nor a margin (`steerOnCost` of the domain); the pool's Pricing tab leaves such models out of its cheapest-to-dearest range and counts them.
- The **value of a credit** (USD) is typed per pool in the toolbar. With it, cells show the margin (`1 − cost per credit ÷ value`); without it they show the cost per credit only. A negative margin is said by its sign and wording, not by colour alone.
- Both settings are **kept in this browser only** (local storage, key `kaiten:ai-pricing`): the API has no field for them yet. They are not saved to Kaiten and not shared with a colleague, and the screens say so next to the fields.
- A pool with no rule shows what is left to do (models, a grant on a version, a first rule) with links to the screens that do it. A pool with no model in the tab, a read that fails (with a retry) and a session that may not read each have their own state.

### Rule panel

- The panel opens from a cell (`?cell=`) as a side sheet. It shows the four levels of the resolution for that model and version, and which one applies.
- What it offers depends on the cell: edit or archive the rule that names the model; for a model priced by a wildcard, **override** it with a rule of its own (which opens empty) or open the wildcard; add a rule where there is none; for the wildcard cell, edit the wildcard with a warning of how many models it reprices, or add the wildcard of the other level. A model whose rule prices every request type can get a second rule for the request type of the tab alone.
- A new rule opens empty and cannot be saved before a rate is typed. A blank rate is unpriced, `0` is free; a blank cache rate inherits the input-token rate. What names a rule (pool, model, request type) is fixed once it exists.
- The preview prices the small, reference and large calls as the rates are typed, before and after for an edit, with the same engine as the grid. The server remains the authority for the charge.
- Archiving asks first and says what will price the calls next: a less specific rule, or none (the calls are refused).
- Unsent changes are kept, with one discard dialog for every way out: opening another cell, changing tab, pool or family, or closing (held in the page); the browser's Back and Forward and any link elsewhere (the router's blocker, `useBlocker`); closing or reloading the tab (the browser's own `beforeunload` prompt). A change of the search box or of the status filter keeps the form and asks nothing.
- The panel says who last edited the rule and who created it, with when.
- When the panel opens, the cell it is about is scrolled back into view inside the grid's own scroller, clear of the pinned first column and head; the page itself never scrolls sideways. Between 1024 and 1280 px the panel is laid over the right edge and the grid gives it that room.
- Cells and row heads are memoised: opening the panel, or typing in the search box, does not draw the grid again.
- Rates and model status are evaluated at commit, including for calls already reserved.

### Model catalogue

- The list searches the catalogue, filters it by status, and shows each model's identity, vendor, modality, status, vendor cost (USD per million tokens, or per unit) and the number of active rules that name it, which links to the rate card filtered on the model. The count comes from the rate card read: a dash where the session may not read it.
- **Delete** on a model that rules name does not delete: the dialog says a referenced model cannot be deleted and offers to **archive** it, with what that does (no usage is authorized, wildcards included; its rules stay; reversible in its form). A model no rule names is deleted after the usual confirmation; when the API refuses all the same (409 `DeleteModel.InUse`, a rule the rate card does not list, such as an archived one), the dialog stays and makes the same offer.
- The form puts identity first; description, aliases and vendor costs sit in disclosures that reopen on an invalid field. Vendor costs are optional USD rates, separate from the credit rules: changing one never changes what a customer is charged.
- A new model lists the wildcard rules that will price it as soon as it exists, per licence version and pool, read from the rate card.
- Opened from an entitlement (`?entitlementSlug=&licenseSlug=`), the model pages keep that context and offer the way back to the pool's Pricing tab.

## OpenRouter onboarding

`/ai/models/import` explicitly opens the public catalogue, then reviews a
single model in the existing ModelForm. Unknown types require manual selection;
variable/incomplete/unsupported prices import identity with manual vendor pricing.
An explicit consent checkbox associates the source identifier without claiming
that user-edited costs are an applied provider snapshot. Collision checks use the
complete local catalogue. Public fetches omit credentials and referrer.

The catalogue is fetched by the user's browser from
`https://openrouter.ai/api/v1/models`, not by the API. The browser needs
outbound access to it, and a Content Security Policy put in front of the console
(the shipped nginx and charts set none) must allow it:
`connect-src https://openrouter.ai`. When the fetch is refused (CSP, offline,
air-gapped install) or times out, import and source checks show an inline
"unreachable" message pointing to manual creation; nothing else depends on it.

`/ai/models/:modelSlug/source` reads the local model without contacting a
provider. Check/Choose source are explicit reads. Source linking and selected
price/name/description application require consent/write access; nothing is
preselected. Fresh identity/source/selected-field checks prevent stale-preview
clobbering, while unselected costs and metadata survive. Missing source values
never clear saved fields, and a disappeared source never archives a model.
Manual edits also fresh-read and merge changed fields, including nested costs,
rejecting concurrent changes to an explicitly edited field or cost dimension.
There remains a GET-to-PUT race because the API has no compare-and-swap version.
Supplier USD rates never update entitlement customer-credit conversion rules.

## Local opt-in and mocks

The API uses the real platform-owned `ai-credits` flag, default/fallback false;
there is no deployment enable boolean. Prepared local development names the
trusted Dogfooding source independently of metering. The separately invoked
`local-ai` profile can converge its flag for the actual Sushi organization; the
ordinary demo profile only reads eligibility and never enables the flag. The
real local frontend also needs the matching platform URL/read-only token source.
See [the local workshop](../../../../DEVELOPMENT.md#explicit-local-ai-workshop).
Neither localhost nor SDK opt-in authorizes AI. Seed/credential actions need
separate authorization; only deliberately mocked E2E uses its fake flag source.

MSW/E2E defaults both inputs off. `aiCapability: { enabled: true }` and
`flagEvaluations: { 'ai-credits': true }` are separate explicit mock slots; ordinary
fixtures must not opt in globally. The `ai` slot holds the AI world (models, pools,
versions, rules, inferences, reservations): `createAiWorldModels({ flag })` and
`installAiWorldMocks` in `e2e/app/ai/ai.scenarios.ts` and
`e2e/app/_support/mocks/install-ai-app-mocks.ts`. `pnpm run dev:mock` has AI on;
`?ai=off` in the address of a tab turns it off. With the slot installed the mock
API also answers OpenRouter's public catalogue with a synthetic one
(`src/e2e/msw/openrouter-handlers.ts`), so nothing reaches the real site. Node unit
tests do not verify a real browser, provider or server.

Concurrent availability observers share only a pending platform evaluation for
one source/subject. Replacing an initializing OFREP provider would close it and
emit an error that cancels healthy capability reads, notably on StrictMode
remount. Completed evaluations are never retained; the next read evaluates anew.

Operational entitlement/grant/price/voucher views project original catalogue
`NUMBER_AI_CREDIT` identity, never normalized `NUMBER`. Canonical grant arrays and
serializer payloads stay intact. A new version refuses known AI or unresolved
canonical grant/price copies before creation while off; it never skips hidden
rows. The server must also refuse copies whose filtered base no longer provides
complete canonical relations. Ordinary full-replace writes depend on server-side
preservation of unchanged hidden relations.

Invoice-linked ordinary `?history=` journal drawers and exports are immutable
financial evidence and remain readable under their existing permissions, including
hidden or deleted live resources. This exception does not enable operational
catalogue links, inference history, reservations or AI writes.

## Tests

- Unit tests sit in `__tests__/` beside the code: `pricing/__tests__/` (the page against the mock world, the pure rate-card model), `pricing/panel/__tests__/` (every state of the panel, what goes on the wire) and `models/__tests__/`. The arithmetic is tested in the domain.
- Stories: `pricing/stories/rate-card-grid.stories.tsx` and `pricing/panel/stories/pricing-cell-panel.stories.tsx`.
- The old URLs are covered by `routes/ai/-tests/` (guards and redirects).

## Public API

`index.ts` exports `PricingPage`, `readPricingSearch`, `PricingSearch`, `AiCatalogueLayout`, `ModelsPage`, `ModelForm`, `ModelEditorPage`, `ModelImportPage` and `ModelSourcePage`. Only the routes under `routes/ai/` import them.
