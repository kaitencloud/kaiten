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
		g.answers = &answers{ttl: ttl, now: time.Now, byOrganization: map[uuid.UUID]answer{}}
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
	entitled, err := g.entitled(ctx, organizationID)
	if err != nil {
		return apierrors.Unavailable(CodeEntitlementCheckUnavailable,
			"whether this organization's plan includes billing could not be checked; nothing was changed, retry")
	}
	if !entitled {
		return apierrors.Forbidden(CodeNotEntitled, "this organization's plan does not include billing")
	}
	return nil
}

// entitled asks the licensing authority, or answers what it said last.
func (g Gate) entitled(ctx context.Context, organizationID uuid.UUID) (bool, error) {
	if g.answers == nil {
		return g.entitlements.Entitled(ctx, organizationID, dogfooding.BillingEntitlementSlug)
	}
	if entitled, fresh, ok := g.answers.get(organizationID); ok && fresh {
		return entitled, nil
	}
	entitled, err := g.entitlements.Entitled(ctx, organizationID, dogfooding.BillingEntitlementSlug)
	if err != nil {
		if last, _, ok := g.answers.get(organizationID); ok {
			return last, nil
		}
		return false, err
	}
	g.answers.set(organizationID, entitled)
	return entitled, nil
}

type answer struct {
	entitled bool
	at       time.Time
}

// answers are the licensing authority's last answers, per organization.
type answers struct {
	ttl time.Duration
	now func() time.Time

	mu             sync.Mutex
	byOrganization map[uuid.UUID]answer
}

// get is the last answer for organizationID: fresh while younger than ttl,
// and kept as a fallback until staleFor times ttl.
func (a *answers) get(organizationID uuid.UUID) (entitled, fresh, ok bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	last, ok := a.byOrganization[organizationID]
	if !ok {
		return false, false, false
	}
	age := a.now().Sub(last.at)
	if age > staleFor*a.ttl {
		delete(a.byOrganization, organizationID)
		return false, false, false
	}
	return last.entitled, age < a.ttl, true
}

func (a *answers) set(organizationID uuid.UUID, entitled bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.byOrganization[organizationID] = answer{entitled: entitled, at: a.now()}
}
