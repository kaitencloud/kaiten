# Billing capability gates

`Gate.Require` keeps the commercial surface behind the deployment's billing
switch, then the organization's BOOLEAN `billing` grant.
`Gate.RequireEntitlement` keeps that order and checks an additional BOOLEAN
grant. Callers already past `Require` use `RequireCapability` for the same
organization without repeating the billing lookup. A self-hosted deployment
remains `AlwaysEntitled`.

## Voucher and add-on plans

The first implementation slice of
[kaitencloud/brain#60](https://github.com/kaitencloud/brain/pull/60) declares
`vouchers` and `addons` as BOOLEAN entitlements. A denied grant answers 403
`Vouchers.NotEntitled` or `Addons.NotEntitled`. If the licensing authority
cannot answer and no usable cached answer exists, the operation answers 503
`Vouchers.EntitlementCheckUnavailable` or `Addons.EntitlementCheckUnavailable`.
The billing gate's own refusal always precedes a capability refusal. Public
voucher boundaries preserve the opaque `422 <operation>.VoucherInvalid` contract
for voucher-specific grant refusals, including customer-portal redemption and
its dry runs; the portal keeps `NoLiveSubscription` / `SubscriptionIncomplete`
ahead of that opaque refusal and prefetches the grant before row locks.
Vendor/Core callers retain the detailed 403/503 codes. Billing and
authentication refusals keep their own contracts. Public session validation
counts its session/customer attempt before licensing, including grant-refused
checks; an exhausted budget stops before any licensing call.

Answers are cached per organization **and slug**, with the billing cache TTL.
During an outage a known answer stands for at most 24 TTLs. A display-only
capabilities read keeps a feature false when its grant is denied or unknown.
The two independent display checks run together instead of stacking timeouts.
Unknown grants also appear in `featureCheckUnavailable`, so clients can retry
without confusing an outage with a known denial or losing baseline read access.
It does not turn an unknown grant into permission to write. `features.vouchers` and
`features.addons` are false when billing itself is unavailable for the
organization. The existing console route/navigation guards consume those flags.

## One-time checkout authorization

`BeginSelection` reads billing and the selected voucher/add-on grants before
opening a transaction, with a ten-second check deadline and no process-cache
outage fallback. Its private request-local scope lasts at most one minute,
ends on request cancellation/return, and binds the authority, organization,
actor, base price, voucher and add-on quantities. Anonymous completion binds it
once to the instance it creates, after rechecking the locked checkout selection.
A hosted-payment redirect carries no scope; the return request checks again.

Nested subscribe/attach/redeem gates reuse only that exact decision. A changed,
missing (for nested subscription), expired or foreign decision fails closed
without licensing I/O under row locks. Direct subscribe, attach and redeem
entrypoints retain their own authorization. Successful transactions validate
the scope again before commit. This is authorization for one bounded attempt,
not instantaneous grant revocation at commit. Checkout/instance/subscription
locks, trial/redemption capacity, eligibility, quantities, frozen contracts and
paid-finalization grandfathering remain unchanged. There is no process-wide
completion lock or authorization cache.

## Protected operations

- Creating, updating and publishing voucher/add-on catalogue objects, prices,
  grants and compatibility; unarchiving an add-on also requires its grant.
- Voucher validation and redemption, including the vendor, customer-session
  and anonymous checkout surfaces. Validation is a prospective new use, not a
  catalogue read of an existing redemption.
- Attaching an add-on and increasing the quantity of an existing attachment.
- Explicit `voucherCode` / `addOns` in a subscription or invoice preview.
- Anonymous checkout creation (dry runs included), after key configuration and
  checkout-specific limits but before Turnstile or session writes, and
  confirmation of an OPEN checkout, before provider setup/adoption
  or customer/instance creation. Customer checkout's subscription preflight
  likewise precedes payment-method and billing-email changes.

## Downgrade policy used by this slice

The proposal's conservative policy is adopted here: existing redemptions and
attachments are not revoked or stopped by losing a grant. Catalogue reads
(including GraphQL), redemption/attachment history, retirement operations
(archive/delete/revoke/deprecate/remove/unassign), quantity decreases, removal
and no-op quantities remain billing-only. A scheduled decrease may still be
replaced or cancelled without increasing the currently held quantity. Purely
clearing an add-on version's default flag or hiding a public family is also
allowed: these are prerequisites for retirement, not catalogue expansion.
The public storefront is a new-selection surface: it omits add-on offers when
their grant is denied or unknown while leaving base plans available; vendor
catalogue reads and existing holdings are unchanged. Checkout still rechecks
selections, so a catalogue snapshot never authorizes a purchase.
Quantity writes prefetch the grant before taking row locks, then use the locked
current quantity to decide whether that result applies.

Existing billing readers and maintenance still apply previously granted
discounts, boosts and add-ons. Shared activation pricing also remains readable
for legacy checkout sessions. Authorization belongs to new-use orchestration,
not those pricing readers.

An accepted pending checkout is a deliberate exception: its priced ACTIVATION
payment must still settle the selected add-ons/voucher through `AttachPaid` /
`RedeemPaid`. Those existing payment-finalization paths remain gate-free. An
OPEN checkout has bought nothing yet and must pass the current grants at confirm.

## Release flow — catalogue and manual grant enablement

1. In **saas-api**, publish the BOOLEAN catalogue entries for both slugs. Its
   catalogue/type parity tests must pass. Bootstrap does not associate these two
   capabilities with licences or overwrite manually assigned values.
2. Deploy the frontend/backend entitlement reader. In a licensed, non-exempt
   organization, missing grants leave voucher/add-on features disabled; unavailable
   checks remain fail-closed with retry behavior. Existing self-hosted/platform
   exemptions are unchanged.
3. An authorized operator can inspect the disabled features and manually associate
   the capabilities with the correct licence, then verify access. Ordinary billed/
   frozen-version guards still apply; this release adds no licence migration,
   automatic grant backfill, static rollout policy, or guard bypass.

No live deployment, licence edit, migration or credential change was performed by
this PR. Existing checkout/trial/redemption consistency locks and one-time bounded
selection authorization remain intact.

The remaining proposal items are separate: service-account counting/deletion
and backfill need a product decision; audit retention is already on Core main
in #93; metering-events needs a design; threshold alerting and connector quotas
remain decision-dependent/deferred. The cross-repo catalog and editions/pricing
copy updates are not part of this Core-only implementation.
