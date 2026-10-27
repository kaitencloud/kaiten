# AI credits console

`/catalog/models` owns the shared catalogue and full-page model editor. Existing
`/ai/models`, `/ai/models/new` and `/ai/models/:modelSlug/edit` URLs redirect in
place, retaining entitlement/version search context. `/ai/matrix` remains a
secondary family comparison, linked from an entitlement's Calculation tab.
The primary journey is `/catalog/entitlements/:entitlementSlug/calculation`.
AI routes guard before child loaders: deployment capability **and** successful
platform rollout must both be true. Off/missing/error/stale capability or flag
state hides all AI navigation, forms and loading/unavailable/retry panels; direct
and legacy operational links return not found. Operation scopes still apply.
The management API enforces its own default-off deployment policy independently
of these console affordances.

Models use generated REST schemas/mutations and cursor-complete catalogue reads.
The family matrix uses `Query.models` + `licenseFamily.versions` with entitlements
and active conversion rules in one generated GraphQL document. Editors mutate
REST and invalidate both REST keys and the GraphQL matrix/wildcard-impact reads.
The single rule editor lives in `domains/ai-credits`; this feature retains its
screens, matrix GraphQL query and wildcard-impact read. Rule identity cannot change on update. Wildcards price future non-archived
catalogue models; rules without grants remain visible with a warning.

Pricing presets replace the complete rate vector only after explicit confirmation.
Blank cache-read/cache-write rates inherit the input-token rate; explicit zero
prices those tokens for free. Other blank dimensions are unpriced. The synthetic typical-call preview
uses exact decimal arithmetic and is explicitly non-authoritative. Vendor costs
are REST-only. There is no summary/dashboard/reconciliation API in V1.

The management forms need `read:models`/`write:models`, `read:licenses`/
`write:licenses`, and the existing entitlement read scope for pool selection.
Identity-provider scopes must be provisioned before exposing the platform flag.
Models' status changes are reversible; archived catalogue entries stay visible.
The matrix omits archived rules, but retains rules whose pool is not granted.

Instance AI usage lives in the instances feature, with status, date range and
transaction filters supported by the read API. Adaptive two-to-six-decimal credit summaries are paired
with the complete stored inference record. Limits and soft maxima use the effective
usage gauge, including billing add-on/boost policy; an add-on-only pool needs no
licence grant lookup. Lean V1 records do not carry pricing
snapshots or persisted warnings, so the console does not invent them. Reservations
are read-only; no provider request or usage-report write is made by the UI.


## Catalogue and editors

The catalogue shares search across its desktop identity/provider/status table and
mobile cards; both retain model identifiers, modality, lifecycle and Edit.
Model configuration puts identity first, with description, aliases and vendor pricing
in native disclosures that reopen for invalid fields. Supplier
costs are optional USD rates, separate from customer credit conversion.
Display labels are localized; API enum values and exact decimal strings remain
unchanged, as do immutable identities, metadata and query invalidation.

The matrix keeps version context pinned within its local scrolling table. Rule
editing remains inline before the matrix: the named editor receives focus when
its reads complete, and Cancel or successful Save restores the originating
control. Reads have scoped loading/error/retry states; failed writes retain the
form and show an inline error alongside the existing toast. The server remains
the sole authority for billing, limits and final rounding.


## Entitlement context and permissions

Catalogue and matrix links carry `entitlementSlug` and exact `licenseSlug` search
parameters. A Back to entitlement action returns to the same Calculation tab
with that version. Model create/edit/save/cancel links retain this context.
A contextual matrix resolves the selected version's family and shows only the
fixed entitlement's rules across its versions; its shared editor never asks for
another pool. Legacy matrix visits without context keep the general pool picker.

UI scope checks use the shared token query through `hooks/use-granted-scopes`,
`hasScope` and generated operation requirements. Known missing scopes suppress
queries/actions; unknown claims defer to the API and its inline refusals. Model
pages require model reads; matrix reads require model and licence reads. Editors
require the corresponding writes. The authenticated `/ai/capabilities` read
reports the organization's platform rollout decision without adding a product
read scope; it does not replace grant authorization or change charging behavior.

## OpenRouter onboarding

`/catalog/models/import` explicitly opens the public catalogue, then reviews a
single model in the existing ModelForm. Unknown types require manual selection;
variable/incomplete/unsupported prices import identity with manual vendor pricing.
An explicit consent checkbox associates the source identifier without claiming
that user-edited costs are an applied provider snapshot. Collision checks use the
complete local catalogue. Public fetches omit credentials and referrer.

`/catalog/models/:modelSlug/source` reads the local model without contacting a
provider. Check/Choose source are explicit reads. Source linking and selected
price/name/description application require consent/write access; nothing is
preselected. Fresh identity/source/selected-field checks prevent stale-preview
clobbering, while unselected costs and metadata survive. Missing source values
never clear saved fields, and a disappeared source never archives a model.
Manual edits also fresh-read and merge changed fields, including nested costs,
rejecting concurrent changes to an explicitly edited field or cost dimension.
There remains a GET-to-PUT race because the API has no compare-and-swap version.
Supplier USD rates never update entitlement customer-credit conversion rules.

## Local opt-in and synthetic tests

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
fixtures must not opt in globally. Node unit tests do not verify a real browser,
provider or server. Same-session browser/DevTools evidence is still required for
interactive verification when those tools/runtime are authorized.

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
