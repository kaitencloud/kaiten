# AI credits console

`/ai/models` owns the catalogue and full-page model editor; `/ai/matrix` owns
family conversion rules. Their common `/ai` route fails closed behind the
platform `ai-credits` flag, independently of the public management API.

Models use generated REST schemas/mutations and cursor-complete catalogue reads.
The family matrix uses `Query.models` + `licenseFamily.versions` with entitlements
and active conversion rules in one generated GraphQL document. Editors mutate
REST and invalidate both REST keys and the GraphQL matrix/wildcard-impact reads.
Rule identity cannot change on update. Wildcards price future non-archived
catalogue models; rules without grants remain visible with a warning.

Pricing presets only fill the rate vector. The synthetic typical-call preview
uses exact decimal arithmetic and is explicitly non-authoritative. Vendor costs
are REST-only. There is no summary/dashboard/reconciliation API in V1.

The management forms need `read:models`/`write:models`, `read:licenses`/
`write:licenses`, and the existing entitlement read scope for pool selection.
Identity-provider scopes must be provisioned before exposing the platform flag.
Models' status changes are reversible; archived catalogue entries stay visible.
The matrix omits archived rules, but retains rules whose pool is not granted.

Instance AI usage lives in the instances feature, with status, date range and
transaction filters supported by the read API. Two-decimal summaries are paired
with the complete stored inference record. Lean V1 records do not carry pricing
snapshots or persisted warnings, so the console does not invent them. Reservations
are read-only; no provider request or usage-report write is made by the UI.
