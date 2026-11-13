# AI credit calculation domain

Business UI shared by the AI catalogue/matrix and entitlement Calculation tab.
Pages remain in their features; the domain owns no routes or ledger.

- `rule-form.tsx`, `rule-editor.tsx` / `rule-form.schema.ts`: one generated-schema-based rule editor.
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
- `ai-access.ts`, `use-ai-access.ts`, `ai-availability.tsx`: one fail-closed
  decision: authenticated Core `GET /ai/capabilities` must answer literal
  `enabled: true` **and** a current successful platform `ai-credits` evaluation
  must be true. Missing/old server, invalid value, provider error/stale state,
  pending initial reads and expired/invalidated positives omit AI UI entirely.
  Scope checks remain mandatory. Capability transport uses the shared bearer
  interceptor and `cache: no-store`; the temporary `*.api.ts` seam is confined
  here until authoritative OpenAPI regeneration supplies the operation.
- `ai-request-guard.ts`: blocks dedicated AI REST requests and classified generic
  targets, cancels/removes operational AI query data on denial/identity reset,
  and immediately closes the gate after local platform-flag invalidation.
  Matrix GraphQL and wildcard discovery also assert admission before their reads.
  Successful snapshots expire 30 seconds after the older component observation,
  refreshed every 10 seconds and
  on focus/reconnect; route guards always fetch fresh. Background refresh can use
  a still-current successful snapshot, not an expired, failed or invalidated one.
  Either newly false/error component wins immediately without waiting for a hung
  counterpart. An expiry deadline revokes/cancels admitted requests even if no
  cache event arrives. This avoids discarding editors on every successful poll. Server enforcement is
  authoritative; this is not an instantaneous cluster kill switch.
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
