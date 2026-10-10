package catalogue

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Subscription is what an attachment write needs of the instance's live
// subscription.
type Subscription = db.GetLiveSubscriptionRow

// LiveSubscription reads, and holds FOR SHARE, the instance's live
// subscription; nil when the instance is not billed.
func LiveSubscription(ctx context.Context, q *db.Queries, organizationID, instanceID uuid.UUID) (*Subscription, error) {
	sub, err := q.GetLiveSubscription(ctx, db.GetLiveSubscriptionParams{OrganizationID: organizationID, InstanceID: &instanceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &sub, nil
}

// RefuseBoundaryPending refuses a change while the subscription's period has
// ended and its close has not run: the change would land before or after the
// boundary depending on how late the close is.
func RefuseBoundaryPending(operation string, sub *Subscription) error {
	if sub != nil && sub.BoundaryPending {
		return kaitenerrors.Conflict(operation+".BoundaryPending",
			"the subscription's period has ended and is being closed; retry in a minute").WithRetryAfter(time.Minute)
	}
	return nil
}

// InstanceAddons reads an instance's attachments, each with the prices its
// subscription bills (none when sub is nil). id narrows to one attachment.
func InstanceAddons(ctx context.Context, q *db.Queries, organizationID, instanceID uuid.UUID, sub *Subscription, includeRemoved bool, id *uuid.UUID) ([]InstanceAddon, error) {
	rows, err := q.ListInstanceAddons(ctx, db.ListInstanceAddonsParams{
		OrganizationID: organizationID, InstanceID: instanceID, IncludeRemoved: includeRemoved, ID: id,
	})
	if err != nil {
		return nil, err
	}
	billed := map[uuid.UUID][]prices.Price{}
	if sub != nil && len(rows) > 0 {
		ids := make([]uuid.UUID, len(rows))
		for i, row := range rows {
			ids[i] = row.AddonID
		}
		active := db.PriceStatusACTIVE
		all, err := Prices(ctx, q, organizationID, ids, &active)
		if err != nil {
			return nil, err
		}
		for addonID, list := range all {
			for _, price := range list {
				if price.Metered != nil ||
					(price.IsDefault && price.BillingPeriod != nil && *price.BillingPeriod == string(sub.BillingPeriod)) {
					billed[addonID] = append(billed[addonID], price)
				}
			}
		}
	}
	out := make([]InstanceAddon, len(rows))
	for i, row := range rows {
		attached := InstanceAddon{
			ID: row.ID, AddonID: row.AddonID, AddonSlug: row.AddonSlug, FamilySlug: row.FamilySlug, Name: row.AddonName,
			Quantity: row.Quantity, MaxQuantity: row.MaxQuantity, AttachedAt: row.CreatedAt.Time.UTC(),
			RemovedAt: nil, Prices: billed[row.AddonID],
		}
		if row.RemovedAt.Valid {
			at := row.RemovedAt.Time.UTC()
			attached.RemovedAt = &at
		}
		if attached.Prices == nil {
			attached.Prices = []prices.Price{}
		}
		out[i] = attached
	}
	return out, nil
}

// ValidateQuantity checks a quantity against the version's maximum.
func ValidateQuantity(operation string, quantity int32, maxQuantity *int32) error {
	if quantity < 1 {
		return kaitenerrors.UnprocessableEntity(operation+".InvalidQuantity", "quantity is at least 1")
	}
	if maxQuantity != nil && quantity > *maxQuantity {
		return kaitenerrors.UnprocessableEntityf(operation+".QuantityExceedsMax", "this add-on allows at most %d units", *maxQuantity)
	}
	return nil
}
