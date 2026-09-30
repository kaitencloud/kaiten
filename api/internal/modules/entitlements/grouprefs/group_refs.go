package grouprefs

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

type Reader interface {
	GetEntitlementGroupsForEntitlement(ctx context.Context, arg db.GetEntitlementGroupsForEntitlementParams) ([]db.EntitlementGroup, error)
}

func LoadForEntitlement(
	ctx context.Context,
	reader Reader,
	entitlementSlug string,
	organizationID uuid.UUID,
) ([]*schema.EntitlementGroupSummary, error) {
	groups, err := reader.GetEntitlementGroupsForEntitlement(ctx, db.GetEntitlementGroupsForEntitlementParams{
		EntitlementSlug: entitlementSlug,
		OrganizationID:  organizationID,
	})
	if err != nil {
		return nil, err
	}

	return dbmap.ToEntitlementGroupRefs(groups), nil
}
