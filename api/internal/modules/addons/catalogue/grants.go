package catalogue

import (
	"context"
	"errors"
	"fmt"
	"math"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// AddonGrant is a grant as a write gives it.
type AddonGrant struct {
	Value                          map[string]any `json:"value" doc:"{type, value}, shaped like a licence grant: a number counts once per unit of quantity" example:"{\"type\":\"number\",\"value\":5}"`
	OverrideBehavior               string         `json:"overrideBehavior,omitempty" enum:"ADD,OVERRIDE,MAX" default:"MAX" doc:"How a number grant combines with the licence's"`
	LimitCapExceededOveragePercent *int32         `json:"limitCapExceededOveragePercent,omitempty" doc:"The overage the add-on allows: -1 with an unlimited value, 0 or more otherwise. Absent inherits the licence grant's."`
}

// Normalize checks a grant against its entitlement's type and returns what to
// store. An absent overage percent stays absent: it inherits the licence's.
func (g AddonGrant) Normalize(operation string, entitlementType db.EntitlementType) ([]byte, *int16, db.AddonOverrideBehavior, error) {
	normalized, err := entitlementvalue.NormalizeLicenseValue(entitlementschema.Type(entitlementType), g.Value)
	if err != nil {
		return nil, nil, "", kaitenerrors.UnprocessableEntity(operation+".InvalidValue", err.Error())
	}
	raw, err := entitlementvalue.ToBytes(normalized)
	if err != nil {
		return nil, nil, "", err
	}
	behavior := db.AddonOverrideBehaviorMAX
	if g.OverrideBehavior != "" {
		behavior = db.AddonOverrideBehavior(g.OverrideBehavior)
	}
	if g.LimitCapExceededOveragePercent == nil {
		return raw, nil, behavior, nil
	}
	invalid := func(reason string) error {
		return kaitenerrors.UnprocessableEntity(operation+".InvalidLimitCapExceededOveragePercent", reason)
	}
	if normalized.Type != entitlementvalue.TypeNumber {
		return nil, nil, "", invalid(fmt.Sprintf("limitCapExceededOveragePercent is only allowed when value.type is %q", entitlementvalue.TypeNumber))
	}
	threshold, ok := normalized.Value.(float64)
	if !ok {
		return nil, nil, "", invalid("entitlement numeric value is invalid")
	}
	percent := *g.LimitCapExceededOveragePercent
	if err := entitlementvalue.ValidateLimitCapExceededOveragePercent(threshold, percent); err != nil {
		return nil, nil, "", invalid(err.Error())
	}
	if percent > math.MaxInt16 {
		return nil, nil, "", invalid(fmt.Sprintf("limitCapExceededOveragePercent must be at most %d", math.MaxInt16))
	}
	//nolint:gosec // bounded to [-1, math.MaxInt16] by ValidateLimitCapExceededOveragePercent and the check above
	stored := int16(percent)
	return raw, &stored, behavior, nil
}

// LockedGrant reads one grant of a version; code when it has none.
func LockedGrant(ctx context.Context, q *db.Queries, organizationID, addonID uuid.UUID, entitlementSlug, code string) (db.ListAddonEntitlementsRow, error) {
	rows, err := q.ListAddonEntitlements(ctx, db.ListAddonEntitlementsParams{
		OrganizationID: organizationID, AddonID: addonID, EntitlementSlug: &entitlementSlug,
	})
	if err != nil {
		return db.ListAddonEntitlementsRow{}, err
	}
	if len(rows) == 0 {
		return db.ListAddonEntitlementsRow{}, kaitenerrors.NotFoundf(code, "the add-on version does not grant %q", entitlementSlug)
	}
	return rows[0], nil
}

// Entitlement reads the entitlement a grant names; code when the organization
// has none.
func Entitlement(ctx context.Context, q *db.Queries, organizationID uuid.UUID, slug, code string) (db.GetEntitlementBySlugRow, error) {
	row, err := q.GetEntitlementBySlug(ctx, db.GetEntitlementBySlugParams{OrganizationID: organizationID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return row, kaitenerrors.NotFoundf(code, "entitlement %q not found", slug)
	}
	return row, err
}
