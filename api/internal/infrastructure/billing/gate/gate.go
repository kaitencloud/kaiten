// Package gate decides whether an organization may reach the commercial
// surface: licence prices and invoice previews now, subscriptions and invoices
// later.
//
// Two locks, in order. The deployment's own switch, KAITEN_BILLING_ENABLED,
// off by default. Then, on a deployment licensed by a licensing authority, the
// organization's licence must grant the BOOLEAN billing entitlement; a
// self-hosted deployment is always entitled. Usage reporting, the usage
// history and the effective entitlement reads never pass through here: every
// organization meters, whether it bills or not.
package gate

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// Error codes of a refusal. A wire contract: the console branches on them to
// explain why billing is unavailable rather than show an error.
const (
	CodeDisabled                    = "Billing.Disabled"
	CodeNotEntitled                 = "Billing.NotEntitled"
	CodeEntitlementCheckUnavailable = "Billing.EntitlementCheckUnavailable"
)

// staleFor is how many TTLs the last answer stands for while the licensing
// authority cannot be reached.
const staleFor = 24

// Gate holds the two locks.
type Gate struct {
	enabled      bool
	entitlements services.ConnectorEntitlements
	answers      *answers
}

// New builds the gate. entitlements answers for the billing entitlement; nil
// is services.AlwaysEntitled, the self-hosted answer. It asks on every
// request.
func New(enabled bool, entitlements services.ConnectorEntitlements) Gate {
	return NewCached(enabled, entitlements, 0)
}

// NewCached is New trusting an organization's answer for ttl (§13.1): billing
// routes do not each wait on the licensing authority, and a blip of it does
// not refuse them all -- while it cannot be reached, the last answer stands
// for staleFor times ttl, and only an organization never answered for gets
// 503. A ttl of 0 caches nothing.
func NewCached(enabled bool, entitlements services.ConnectorEntitlements, ttl time.Duration) Gate {
	g := Gate{enabled: enabled, entitlements: services.ConnectorEntitlementsOrAlways(entitlements), answers: nil}
	if ttl > 0 {
		g.answers = &answers{ttl: ttl, now: time.Now, byEntitlement: map[entitlementKey]answer{}}
	}
	return g
}

// Require refuses an organization that may not reach billing: 403
// Billing.Disabled, 403 Billing.NotEntitled, or 503
// Billing.EntitlementCheckUnavailable when the licensing authority cannot say.
func (g Gate) Require(ctx context.Context, organizationID uuid.UUID) error {
	if !g.enabled {
		return apierrors.Forbidden(CodeDisabled, "billing is disabled on this deployment (KAITEN_BILLING_ENABLED)")
	}
	entitled, err := g.entitled(ctx, organizationID, dogfooding.BillingEntitlementSlug)
	if err != nil {
		return apierrors.Unavailable(CodeEntitlementCheckUnavailable,
			"whether this organization's plan includes billing could not be checked; nothing was changed, retry")
	}
	if !entitled {
		return apierrors.Forbidden(CodeNotEntitled, "this organization's plan does not include billing")
	}
	return nil
}

// RequireEntitlement checks a billing capability after the billing gate. The
// caller supplies the stable error namespace (for example Vouchers or Addons).
// Each slug has its own cached answer; an unknown answer is a retryable 503.
func (g Gate) RequireEntitlement(ctx context.Context, organizationID uuid.UUID, slug, namespace string) error {
	if err := g.Require(ctx, organizationID); err != nil {
		return err
	}
	return g.RequireCapability(ctx, organizationID, slug, namespace)
}

// RequireSelection checks billing once, then only the new uses selected.
func (g Gate) RequireSelection(ctx context.Context, organizationID uuid.UUID, hasVoucher, hasAddons bool) error {
	if err := g.Require(ctx, organizationID); err != nil {
		return err
	}
	if hasVoucher {
		if err := g.RequireCapability(ctx, organizationID, dogfooding.VouchersEntitlementSlug, "Vouchers"); err != nil {
			return err
		}
	}
	if hasAddons {
		return g.RequireCapability(ctx, organizationID, dogfooding.AddonsEntitlementSlug, "Addons")
	}
	return nil
}

// RequireCapability checks only the feature grant after the caller has passed
// Require for the same organization. It avoids a second billing lookup; callers
// that have not passed billing must use RequireEntitlement or RequireSelection.
func (g Gate) RequireCapability(ctx context.Context, organizationID uuid.UUID, slug, namespace string) error {
	granted, err := g.entitled(ctx, organizationID, slug)
	if err != nil {
		return apierrors.Unavailable(namespace+".EntitlementCheckUnavailable",
			"whether this organization's plan includes "+slug+" could not be checked; nothing was changed, retry")
	}
	if !granted {
		return apierrors.Forbidden(namespace+".NotEntitled", "this organization's plan does not include "+slug)
	}
	return nil
}

// CheckEntitlement preserves an unknown answer for display. Known answers
// follow the same TTL and bounded staleness policy as write authorization.
func (g Gate) CheckEntitlement(ctx context.Context, organizationID uuid.UUID, slug string) (bool, error) {
	granted, err := g.entitled(ctx, organizationID, slug)
	return err == nil && granted, err
}

// entitled asks the licensing authority, or answers what it said last.
func (g Gate) entitled(ctx context.Context, organizationID uuid.UUID, slug string) (bool, error) {
	if granted, scoped, err := g.selectionAnswer(ctx, organizationID, slug); scoped {
		return granted, err
	}
	if g.answers == nil {
		return g.entitlements.Entitled(ctx, organizationID, slug)
	}
	if entitled, fresh, ok := g.answers.get(organizationID, slug); ok && fresh {
		return entitled, nil
	}
	entitled, err := g.entitlements.Entitled(ctx, organizationID, slug)
	if err != nil {
		if last, _, ok := g.answers.get(organizationID, slug); ok {
			return last, nil
		}
		return false, err
	}
	g.answers.set(organizationID, slug, entitled)
	return entitled, nil
}

// Feature is a BOOLEAN entitlement of the organization's own plan that
// changes what Kaiten shows, never what it does: the plan is asked as the
// gate asks it, its answer trusted for ttl and kept while the licensing
// authority cannot be reached, and an organization it never answered for
// reads false (§24 #70). Self-hosted, every feature is granted.
type Feature struct {
	entitlements services.ConnectorEntitlements
	slug         string
	answers      *answers
}

// NewFeature checks slug, trusting an answer for ttl (0 caches nothing).
func NewFeature(entitlements services.ConnectorEntitlements, slug string, ttl time.Duration) *Feature {
	f := &Feature{entitlements: services.ConnectorEntitlementsOrAlways(entitlements), slug: slug, answers: nil}
	if ttl > 0 {
		f.answers = &answers{ttl: ttl, now: time.Now, byEntitlement: map[entitlementKey]answer{}}
	}
	return f
}

// Granted reports whether the organization's plan grants the feature.
func (f *Feature) Granted(ctx context.Context, organizationID uuid.UUID) bool {
	if f == nil {
		return false
	}
	if f.answers != nil {
		if granted, fresh, ok := f.answers.get(organizationID, f.slug); ok && fresh {
			return granted
		}
	}
	granted, err := f.entitlements.Entitled(ctx, organizationID, f.slug)
	if err != nil {
		if f.answers != nil {
			if last, _, ok := f.answers.get(organizationID, f.slug); ok {
				return last
			}
		}
		return false
	}
	if f.answers != nil {
		f.answers.set(organizationID, f.slug, granted)
	}
	return granted
}

type answer struct {
	entitled bool
	at       time.Time
}

type entitlementKey struct {
	organizationID uuid.UUID
	slug           string
}

// answers are the licensing authority's last answers, per organization and slug.
type answers struct {
	ttl time.Duration
	now func() time.Time

	mu            sync.Mutex
	byEntitlement map[entitlementKey]answer
}

// get is the last answer for organizationID: fresh while younger than ttl,
// and kept as a fallback until staleFor times ttl.
func (a *answers) get(organizationID uuid.UUID, slug string) (entitled, fresh, ok bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	key := entitlementKey{organizationID: organizationID, slug: slug}
	last, ok := a.byEntitlement[key]
	if !ok {
		return false, false, false
	}
	age := a.now().Sub(last.at)
	if age > staleFor*a.ttl {
		delete(a.byEntitlement, key)
		return false, false, false
	}
	return last.entitled, age < a.ttl, true
}

func (a *answers) set(organizationID uuid.UUID, slug string, entitled bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.byEntitlement[entitlementKey{organizationID: organizationID, slug: slug}] = answer{entitled: entitled, at: a.now()}
}
