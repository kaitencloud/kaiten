# Instance AI credit usage

AI usage uses the existing entitlement-report route. `value.type = ai_usage`
is a write-only variant; read values remain number/boolean/object. A credit
pool is `NUMBER_AI_CREDIT` with SUM aggregation. Numeric append reports remain
available for adjustments/refunds; numeric set reports are refused.

## Entitlement definition, allowance and calculation

AI credits are not a separate balance product. The entitlement definition owns
its identity, credit units, SUM aggregation, reset cadence and warning threshold.
A licence version grants its numeric allowance and owns conversion rules for that
entitlement by model/request type. The organization model catalogue is shared;
optional USD supplier costs are not customer credit rates. Instances consume this
same entitlement through the effective allowance and shared accounting writer.

The three `type` fields have different jobs:

| Surface | Type | Meaning |
| --- | --- | --- |
| Entitlement definition and grant metadata | `NUMBER_AI_CREDIT` | A calculated numeric entitlement |
| Model-usage report input | `ai_usage` | Provider quantities for reserve/commit calculation |
| Grant allowance and usage read value | `number` | Numeric included/consumed credits |

For example, a licence grants `{ "type": "number", "value": 1000 }` to the
`ai-credits` entitlement. Its rule for `sushi-assistant` prices input tokens at
`0.001` credits and output tokens at `0.003`. A reserve estimates consumption:

```json
{
  "value": {
    "type": "ai_usage", "phase": "reserve", "transactionId": "inference-001",
    "model": "sushi-assistant", "requestType": "COMPLETION",
    "usage": { "inputTokens": 100, "outputTokens": 50 }
  }
}
```

Send the actual quantities to the same entitlement route with `phase: "commit"`
and `requestStatus: "SUCCESS"`, keeping that call identity. Identical phase/body
retries replay the original response; the resulting usage is a numeric credit
counter, not a new `ai_usage` read type. A `NOT_SENT` commit releases without a
charge. Numeric append reports remain explicit credit adjustments/refunds.

Rules select one complete rate vector, not field-by-field inheritance from less
specific rules. The order is exact model/request, exact model/all requests, any
model/exact request, then any model/all requests. Blank cache-read/cache-write
rates fall back to the selected rule's input rate; explicit zero is free.

`grantedByLicense` describes only a direct licence allowance. Add-ons can grant a
pool while that flag is false; such instances can still use the version's rules.
Reservations are estimates, not locked quotes: rate/rule/model changes affect
pending commits because current configuration is resolved at commit. Stored
inference evidence is unchanged and does not contain immutable rate snapshots.

## Lifecycle and accounting

- `reserve` prices estimated usage and gates it against the maximum minus
  consumption and open, unexpired reservations. It writes an operation record,
  not consumption. The pair advisory lock serializes concurrent grants.
- `commit` prices actual usage, optionally inheriting model/request type from
  the reservation. It accounts a real call even past a commercial cap.
- `NOT_SENT` commits release the reservation without charging, regardless of
  the charge-on-error rule. Expired reservations stop counting immediately;
  the elected minute sweep marks them EXPIRED without moving money.
- Matching retries replay immutable phase response snapshots, with
  `Idempotent-Replayed: true`, before any writes. Conflicting bodies and reserves
  on closed/expired operation IDs return TransactionIdReused.
- The existing report plan/apply path remains the sole counter writer. The AI
  operation stores charge/balance evidence in the same transaction as the
  counter and outbox. No prompt or provider response is stored.

## Configuration

The shared configuration loader accepts:

| Variable | Default |
| --- | --- |
| `KAITEN_USAGE_IDEMPOTENCY_WINDOW` | `840h` (minimum `24h`) |
| `KAITEN_AI_RESERVATION_DEFAULT_TTL` | `10m` |
| `KAITEN_AI_RESERVATION_MAX_TTL` | `1h` |

The default TTL must be positive and no greater than the maximum. `ttlSeconds`
may override it per reserve. AI rollout authority is the **platform-owned Kaiten
`ai-credits` feature flag**, not a configuration boolean. Customer flags,
billing licences, SDK opt-in and localhost cannot enable the API. An absent,
disabled, unready, malformed or failed source denies AI. Omitted policies deny.
Operational refusals are 403 `AIUsage.Disabled`, including reserve, commit,
NOT_SENT release, exact AI replay and numeric adjustments/replay of a persisted
AI pool. Ordinary numeric attempt accounting is retained, including missing,
unsupported and validation/load-failed targets: while off a query-only original
catalogue-type check runs before those failures, and the attempt is submitted
after this report's owned transaction unwinds (an ambient caller transaction may
still surround the call). A known-AI denial counts nothing; a failed type lookup
fails closed rather than guessing that the target is ordinary. GraphQL reports
the same code/status through its existing error presenter.

The operator selects one trusted source using the existing platform organization
and API URL/token-file wiring, independently of `metered.enabled`. A remote
source never falls back to customer/local flags when unavailable. Without a
remote source, the local reader evaluates flags only from the explicitly named
platform organization; no organization means no authority and therefore denial.
A platform organization is not automatically exempt from this rollout flag.
The existing Kaiten repository/evaluator and OFREP provider remain the evaluators;
no second flag engine is introduced. Each remote reporter has a private stable
OpenFeature domain, so a separate reporter or credential rotation cannot replace
its flag authority. Credential-source loss is denied once the existing one-second
watcher observes it; there is no instantaneous file-removal cutover guarantee.

Owning operations resolve the authenticated organization's live flag **once,
before their transaction, planning, replay or writes**. Helpers and GraphQL
loaders consume the private organization-bound decision, never call providers
under locks, and reject a snapshot for another organization. Composed checkouts
use explicit consume-only module ports. A new operation always re-evaluates,
even if its context contains an earlier positive snapshot. The trusted source's
OFREP evaluations use explicitly closed AI-facts readers, preventing a rollout
flag from recursively evaluating itself or targeting on gated AI facts.

GET `/ai/capabilities` requires an authenticated organization caller, no extra
product scope, returns the current same-organization platform decision and sets
`Cache-Control: no-store`. It remains available while off; availability is not
permission to consume a pool. Models, conversion rules, inference/reservation
reads, external classified catalogue/usage views and AI-target mutations use the
same policy. Internal billing/effective arithmetic, immutable journals/exports,
audit evidence and invoices remain readable under their existing scopes,
including deleted-resource financial evidence. Trusted fulfilment of already-paid
ACTIVATION checkouts remains financial bookkeeping, not operational AI admission.

AI maintenance and gauges resolve the current flag separately for each
organization on each run; disabled/unavailable organizations have no AI expiry
writes or observed AI gauges. General retention and billing jobs are unchanged.
No data is deleted or rewritten when the flag is disabled.

For prepared local development, configure the trusted local platform organization.
The **separately authorized `local-ai` profile** converges its `ai-credits` flag;
the ordinary demo profile only reads eligibility before synthetic AI data and
never enables the flag. The identity-only `dev` profile and startup do not seed
product flags. API examples/Helm contain durations, not a rollout switch. See [local development](../../../../DEVELOPMENT.md) for the
operator-owned source/credential setup; no localhost or credential-class bypass
can authorize AI. Do not run a seed or change hosted flags merely to enable a UI.

There is no positive cache and no restart requirement for new-operation
revocation. Already-admitted atomic operations can finish using their local
decision; this is not an instantaneous cluster kill switch. Quiesce and drain
provider calls before planned disable. Blanket off-state denial can leave pending
reservations/settlement uncertain; retain transaction identities and surface
uncertainty instead of treating denial as zero-price/unmetered success. A drain
protocol requires separate design/approval. New-version creation of an AI-bearing
licence family is refused while off because the request supplies no canonical
copy-source version; ordinary metadata edits preserve hidden relations.

## Reads and events

Both usage gauges include `reserved` on credit pools. Inference history uses
keyset pagination and open-reservation reads filter expiry at query time.
History reads emit no outbox events. AI outcomes appear only on AI report
responses. Existing usage crossing webhooks do not carry the request-specific
AI outcome. New events identify soft-maximum crossings and unauthorized usage;
the latter is bounded to one per pair/model/request type/UTC day.

## Precision and operational limits

Rate-vector pricing uses exact decimal arithmetic and half-up rounding to six
places. Computed and charged evidence uses NUMERIC(38,6). The legacy authoritative
usage counter is still float64. At very large balances, a small six-place charge
may not be representable within half a quantum; the write transaction fails
closed rather than recording inconsistent evidence. Applications needing that
range must not treat this implementation as an arbitrary-precision balance.
This limitation requires a future exact-counter migration, not a silent change
in how usage reports or billing journals interpret existing values.

The operation table is plain, not partitioned: billing's partition helper was
not on main. No inference retention/purge policy is implemented in this slice.
The dedup horizon controls recognition, not deletion of historical evidence.

## Billing integration seams

`state.go` loads the grant limit and database clock after the pair lock.
`usecase.go` dispatches the value kind before phase-specific dedup/planning.
`apply.go` is the single counter write; billing's journal INSERT and report
sequence belong immediately after the counter upsert. AI correlation is
`value.transactionId` / `ai.transactionId`, independent of billing's generic
Idempotency-Key request header. AI requests reject a supplied Idempotency-Key
with 422 `AiIdempotencyKeyUnsupported`: numeric header keys are never consumed
by AI debits. The outer `transactionId` is null for AI responses; `ai.transactionId`
is its phase key. AI phase replay preserves the original effective limit,
source and provenance; numeric journal replay keeps billing's null source/provenance.

Actual positive AI charges and numeric adjustments advance `report_seq` and
append one billing usage journal row in the same transaction as the counter,
operation and outbox. Reserve, release, zero-charge commits and phase replay
write no debit journal row. The gate uses the effective entitlement at the single
post-lock report instant, including add-ons, vouchers and instance exceptions.
The AI migration follows billing's latest migration; rolling back AI leaves
billing's effective entitlement view and shared foreign-key targets intact.

### Trusted paid activation fulfilment

The AI rollout switch does not roll back truthful payment booking. A trusted
internal **already-PAID ACTIVATION** may fulfil its existing pending selection
through `billing/incomplete.Settle`, including the licence move and
`AttachPaid`/`RedeemPaid`. This is a narrow financial fulfilment exception, not
new AI admission: new external AI mutations and every AI model/rule/catalogue,
usage/reserve/commit/release/replay operation remain gated while off. No deferred
activation status, retry lifecycle, repricing or alteration of the original
billing basis is introduced. Blocking this fulfilment instead requires a
separately designed durable deferred lifecycle; silently skipping it or rolling
back recorded payment is not safe.

### Unmerged prototype databases

This clean billing-based stack renumbers the AI migration to
`20261024173426_ai_credits.sql`: the earlier prototype's
`20261022230000_ai_credits.sql` collides with billing's audit-actor migration.
Do not apply this stack automatically to a database that already ran the earlier
unmerged AI prototype. Its migration history and existing AI tables need a
reviewed upgrade path first; preserve that database and do not reset, migrate or
reseed it as part of switching branches.
