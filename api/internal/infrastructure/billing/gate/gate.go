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

// Gate holds the two locks.
type Gate struct {
	enabled      bool
	entitlements services.ConnectorEntitlements
}

// New builds the gate. entitlements answers for the billing entitlement; nil
// is services.AlwaysEntitled, the self-hosted answer.
func New(enabled bool, entitlements services.ConnectorEntitlements) Gate {
	return Gate{enabled: enabled, entitlements: services.ConnectorEntitlementsOrAlways(entitlements)}
}

// Require refuses an organization that may not reach billing: 403
// Billing.Disabled, 403 Billing.NotEntitled, or 503
// Billing.EntitlementCheckUnavailable when the licensing authority cannot say.
func (g Gate) Require(ctx context.Context, organizationID uuid.UUID) error {
	if !g.enabled {
		return apierrors.Forbidden(CodeDisabled, "billing is disabled on this deployment (KAITEN_BILLING_ENABLED)")
	}
	entitled, err := g.entitlements.Entitled(ctx, organizationID, dogfooding.BillingEntitlementSlug)
	if err != nil {
		return apierrors.Unavailable(CodeEntitlementCheckUnavailable,
			"whether this organization's plan includes billing could not be checked; nothing was changed, retry")
	}
	if !entitled {
		return apierrors.Forbidden(CodeNotEntitled, "this organization's plan does not include billing")
	}
	return nil
}
