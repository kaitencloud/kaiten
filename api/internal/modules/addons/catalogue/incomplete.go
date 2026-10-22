package catalogue

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// RefuseIncomplete answers 409 <operation>.SubscriptionIncomplete while the
// instance's subscription waits on its checkout's payment: what the checkout
// bought is fixed until it is paid (§9.10 rule 5).
func RefuseIncomplete(ctx context.Context, q *db.Queries, organizationID, instanceID uuid.UUID, operation string) error {
	pending, err := q.InstanceCheckoutPending(ctx, db.InstanceCheckoutPendingParams{OrganizationID: organizationID, InstanceID: &instanceID})
	if err != nil {
		return err
	}
	if pending {
		return kaitenerrors.Conflict(operation+".SubscriptionIncomplete",
			"the instance's checkout waits for its payment: its add-ons change once it is paid or has expired")
	}
	return nil
}
