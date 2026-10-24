# AI credits and entitlement UX audit

Scope: model catalogue, model create/edit, conversion matrix/rule editing, AI credit
entitlement create/edit, and instance credit usage/reservations. This is not a
console-wide visual rebuild.

## Method and design contract

Used UI/UX Pro Max, Hallmark, tasteskill v2's **app-screen** rules, and Emil's
interaction guidance. Retain the existing `DESIGN.md`: DM Sans, Source Code Pro for
identifiers, Kaiten purple and semantic status tokens, and the current component,
route, API and form-schema ownership.

Direction: a restrained **framed-sheet workbench** (tasteskill seed 1972221929),
with clear title/action hierarchy, grouped editors, compact data rows, meaningful
credit figures, and predictable keyboard focus. No marketing heroes, decorative
charts, fabricated metrics, new font dependencies or per-page palette changes.
UI/UX Pro Max's design-system searches returned marketing/glass recommendations
that did not fit this console; those were rejected. Its verified focus and
focus-not-obscured guidance was used instead.

Evidence includes same-owned-Chrome screenshots, DOM bounds/computed styles, CDP
DOM/CSS inspection and request/page-error capture. Desktop and
320/375/414/768px layouts were captured. No document-level horizontal overflow or
page errors were observed. Some tables scroll locally: that is a discoverability
problem, not evidence of root overflow. Browser/DevTools MCP was unavailable;
there is no claim of complete MCP or screen-reader verification. The original
matrix screenshot captured a loading state, not an empty catalogue.

## Ranked findings and changes

| Before | After / required correction | Why |
| --- | --- | --- |
| **P1:** “Blank means unpriced” contradicts cache-read/cache-write fallback to the input-token rate. | Qualify blank-rate guidance; explicitly distinguish inherited rates from an explicit zero. | Financial configuration must not imply a charge is free when it inherits a nonzero rate. |
| **P2:** Model rows require sideways discovery of vendor, modality, status and actions on mobile. | Compact identity/provider/status rows, localized states and visible Edit; retain all fields in the editor. | The most frequent job must remain discoverable without hunting through a wide table. |
| **P2:** Model fields, lifecycle prose, identifiers and six optional vendor costs form one undifferentiated grid. | Group identity, availability and provider details; progressively disclose optional vendor costs and distinguish costs from credits. | Reduces scanning and prevents confusing supplier costs with customer credit pricing. |
| **P2:** Rule editing appears below the matrix without a clear focus/scroll handoff. | A named selected-rule work area, explicit loading feedback, focus on opening and return focus on closing. | An action should produce an immediately visible, keyboard-operable response. |
| **P2:** Applying a preset replaces the complete rate vector without a nearby consequence statement. | Explain replacement and make customized-value replacement deliberate. | Preserve existing preset/API semantics without silently losing financial input. |
| **P2:** Generic instance KPI cards dominate the AI tab; raw ISO dates and equal-sized small figures hide available credits. | AI-tab-only compact layout; meaningful effective remaining/balance strip, localized dates and tabular figures. | Prioritize the question “what can this instance spend?” using effective limits and live reservations, not feed totals. |
| **P2:** Empty reservations keep ten columns, pushing inference history below the first screen. | Compact scoped empty state; condensed populated reservation/history rows with complete record inspection. | Keep the main evidence visible without discarding stored fields or precision. |
| **P2:** Date-range error is announced but not associated with either input. | Link the alert through `aria-describedby` and mark both invalid inputs. | Improve keyboard/error recovery while retaining query validation. |
| **P2:** Entitlement dialog explicitly disables dirty-close confirmation. | Form-aware discard protection for Cancel/Escape/backdrop. | Credit warning/reset/unit edits should not disappear accidentally. |
| **P3:** Primary-colored Cancel/navigation competes with creation; repeated filled Delete buttons dominate rows. | One primary action per view, quiet secondary/destructive actions with existing confirmation. | Emphasize routine work, not deletion. |
| **P3:** Warning threshold lacks unit/blank guidance. | Explain percentage and omission behavior beside the existing bounded field. | Preserve integer 0–100 validation and SUM enforcement while clarifying intent. |

## Invariants and verification targets

- Use real catalogue/gauge data. Preserve zero values, unlimited policy, effective
  add-on/boost overage, live reservations and exact immutable record values.
- Keep raw enum/API values and pricing payloads unchanged when localizing labels.
- Keep metadata and immutable model/rule identity fields intact through edits.
- Distinguish loading, empty, invalid and failed states; retain retry controls.
- Preserve existing tabs, scopes, feature gates and non-AI instance statistics.
- Test cache-rate guidance, explicit zero and preset replacement; model/rule
  payloads; editor focus/close; effective balances/unlimited values; cursor reads;
  range associations; dirty close; mobile and reduced-motion behavior.
- Compare loaded, error and empty states in the real browser at desktop/tablet/
  mobile widths, in both modes where relevant. Never treat a screenshot of loading
  as proof of a completed view.

## Implemented entitlement-centric experience

AI credits now have a Calculation tab on the entitlement, rather than a separate
primary feature entry. Persisted licence grants link to that same editor with the
exact pool and version. Models are shared catalogue entries at `/catalog/models`;
legacy `/ai` links remain compatible. The editor, decimal previews and read states
are shared through the existing AI-credit domain, not duplicated into new forms.

Ordinary entitlement usage recognizes the real AI wire type and shows its numeric
limit/history. Visible credit amounts retain up to six decimal places. Definition
headers identify AI credits as a calculated entitlement; impact statistics remain
on Overview/Usage rather than pushing calculation controls below the first screen.
API examples distinguish definition type, calculation input and numeric result.

Verified application/E2E types, full frontend lint, architecture, i18n, source size,
scoped UI/domain tests and production build. Scoped API contract and real-DB
calculation/replay/concurrency/tenancy regressions passed. Read-only Chrome flows
covered pool/version context, cancellation, grant links and legacy redirects with
no writes or failed requests. Five desktop routes, twenty responsive cases and
light/dark views were captured with same-session DOM/CSS/CDP/network and tasteskill
probes; no root overflow, page errors or tasteskill FAIL findings were observed.

Heuristic warnings were retained deliberately: the locked design uses 30px page
headings and 12px metadata; untouched overview cards have variable content heights,
and generic instance statistics still include proportional figures. Changed credit
and rule amounts are tabular. These are not new global-console redesign targets.
The existing customer-domain test import warning was recorded as a separate task.

## Minimalist forms and explicit OpenRouter refresh

The follow-up puts essential inputs first in AI model and calculation forms.
Optional AI pricing dimensions and policies live in disclosures; existing values
survive collapse and invalid fields reopen. Calculation editing now precedes the
saved rule list, rather than appearing below it.

The shared entitlement identity form retains its existing visible fields and help
text, without a new “Presentation” section. Ordinary numeric units and licence
grant/overage controls retain their pre-AI layout and interactions. Credit-specific
warning controls, SUM-only configuration and optional credit units are restricted
to `NUMBER_AI_CREDIT`; dirty-close confirmation is restricted to AI entitlement
editing. These boundaries undo the earlier generic-form redesign and keep this PR
focused on the AI control plane.

The shared catalogue supports explicit OpenRouter import and source association.
Source review offers individually selected prices and optional name/description
updates. Missing prices are **Not listed**, never zero or a request to clear saved
values. Starting a new Check invalidates its previous preview. Manual saves and
source application fresh-read, preserve unselected fields and reject selected-field
conflicts; the remaining GET-to-PUT race needs API version preconditions to remove.
Supplier USD costs never change customer credit conversion rules.

Final independent verification passed 465 focused tests across 36 files, application
TypeScript, scoped lint, architecture, locale parity/keys, source limits and a
production build. Twenty-one owned-Chrome captures covered model/import/source,
calculation and entitlement forms at desktop/mobile with both theme tokens:
no root overflow, page errors, failed requests or attempted data writes. Same-session
CDP DOM/computed-style evidence accompanied screenshots. A separate real read-only
flow reconfirmed exact entitlement/version queries, cancel context, persisted grant
links, ordinary AI numeric usage and legacy redirects. Apply/import writes were
mock-tested, not performed on workshop data. Published-version grant creation
remained gated and was not bypassed for captures. Live associated-source Check
states are covered by mocked regressions, not a newly persisted source association.
The pre-existing customer-domain import warning and build chunk-size advisory remain.

The audit is heuristic, not a certification of WCAG conformance. Original full
specification, full CI/load sweeps, fresh screen-reader and exhaustive route/state
combinations remain unverified. DevTools/Tenbo MCP were unavailable; direct
same-owned-Chrome CDP evidence is not a claim of complete MCP verification.
