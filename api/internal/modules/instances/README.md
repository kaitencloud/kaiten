# Instance AI credit usage

AI usage uses the existing entitlement-report route. `value.type = ai_usage`
is a write-only variant; read values remain number/boolean/object. A credit
pool is `NUMBER_AI_CREDIT` with SUM aggregation. Numeric append reports remain
available for adjustments/refunds; numeric set reports are refused.

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
may override it per reserve. Runtime APIs are not feature-flagged; the console
is hidden behind the platform `ai-credits` flag until rollout.

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
Idempotency-Key request header. AI correctness does not depend on that header.
