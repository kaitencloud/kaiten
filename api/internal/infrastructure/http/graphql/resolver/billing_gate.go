package resolver

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// billingGateLoaderName is the request's answer of the billing gate, by
// organization.
const billingGateLoaderName = "billingGate"

// RegisterBillingGate makes the billing gate answer once per request: the
// gated fields resolve once per row (License.prices on every licence of a
// page), and each would otherwise ask the licensing authority again.
func RegisterBillingGate(loaders *dataloader.Loaders, billing gate.Gate) {
	loaders.Register(billingGateLoaderName, dataloaderLib.NewBatchedLoader(
		func(ctx context.Context, organizations []uuid.UUID) []*dataloaderLib.Result[struct{}] {
			results := make([]*dataloaderLib.Result[struct{}], len(organizations))
			for i, organizationID := range organizations {
				results[i] = &dataloaderLib.Result[struct{}]{Data: struct{}{}, Error: billing.Require(ctx, organizationID)}
			}
			return results
		}))
}

// requireBilling refuses a field the billing gate keeps out, as its REST
// route is refused: Billing.Disabled, Billing.NotEntitled or
// Billing.EntitlementCheckUnavailable (§13.14, V31-37).
func requireBilling(ctx context.Context) error {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return dataloader.ErrMissingIdentity
	}
	loader, err := dataloader.GetLoader[uuid.UUID, struct{}](dataloader.LoadersFromContext(ctx), billingGateLoaderName)
	if err != nil {
		return err
	}
	_, err = loader.Load(ctx, i.OrganizationID)()
	return err
}
