# AI credit calculation domain

Business UI shared by the AI catalogue/matrix and entitlement Calculation tab.
Pages remain in their features; the domain owns no routes or ledger.

- `rule-form.tsx` / `rule-form.schema.ts`: one generated-schema-based rule editor.
  Fixed entitlement mode receives the actual definition, omits the global pool
  read/selector, and forces its slug into the existing licence-version mutation.
  General matrix mode retains pool selection. Rule identity, nullable ANY values,
  exact decimal strings and full rate-vector semantics are unchanged.
- `pricing-preview.ts`, `rule-pricing.tsx`: existing exact, illustrative pricing
  preview and confirmed presets, not a new authoritative estimate service.
- `conversion-rule-summary.tsx`: complete rates, bounds/error policy and truthful
  direct-grant/add-on explanation, shared by the primary tab and matrix.
- `ai-fields.tsx`, `ai-section.tsx`: shared editor fields and inline read states.
- `ai-query-options.ts`: cursor-complete shared model reads and invalidation using
  generated REST identities plus the unchanged matrix/wildcard keys.
- `query-keys.ts`: identities also invalidated by licence version copies.
- `use-ai-access.ts`, `ai-availability.tsx`: flag and token-scope display gates.
  False and failed evaluation are deliberately described together as unavailable,
  since the existing boolean query cannot distinguish them. No calculation reads
  start while unavailable, pending or known denied; unknown scopes defer to API.
- `ai-navigation.tsx`: pool/version context and Back to entitlement action.

Feature-only GraphQL matrix and all-version model wildcard-impact reads stay in
`features/ai/queries`; the entitlement tab does not call either. It reads only one
selected version's active rules with `entitlementSlug`, including rules with no
direct licence allowance. No backend operation, calculator registry, dependency,
accounting counter or ledger is introduced.

Rule editors appear before their lists, show existing priced dimensions (including
zero) first, and disclose unused rates, policies, matching help and preset
utilities. Hidden invalid fields reopen and receive focus. Full pending-call and
wildcard consequences remain visible; no defaults or rate vectors change merely
by opening or collapsing a section.
