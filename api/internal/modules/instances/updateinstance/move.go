package updateinstance

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getentitlementsusagemetrics"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

// MoveToVersion pins an instance to another licence version and changes
// nothing else: the update every other path makes, with the instance's own
// fields sent back as they are. It is how a self-serve checkout puts an
// instance on the version of the price its customer chose, in the checkout's
// transaction (§14.4 rule 2), so it goes through the same rules -- an archived
// version is refused, a live subscription's freeze still applies -- and emits
// the same event as any change of version.
func (h *UseCase) MoveToVersion(ctx context.Context, instanceSlug string, licenseID uuid.UUID) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}
	current, err := h.repo.GetInstance(ctx, instanceSlug, user.OrganizationID)
	if err != nil {
		return err
	}
	if current.LicenseID == licenseID {
		return nil
	}
	_, err = h.Execute(ctx, &Command{
		Name:             current.Name,
		Description:      current.Description,
		CustomerID:       current.CustomerID,
		LicenseID:        licenseID,
		DeploymentZoneID: current.DeploymentZoneID,
		StartLicenseDate: current.StartLicenseDate,
		EndLicenseDate:   current.EndLicenseDate,
		Metadata:         current.Metadata,
		Slug:             nil,
	}, instanceSlug)
	return err
}

// OverQuota is the entitlements whose usage in their current window is above
// the most the instance now accepts -- its effective limit and percent, read
// in the caller's transaction, so after a move and the add-ons attached with
// it. A self-serve checkout is refused a version its usage already exceeds
// (§14.4 rule 2); unlimited and non-number entitlements never are.
func (h *UseCase) OverQuota(ctx context.Context, instanceSlug string) ([]string, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	instance, err := h.repo.GetInstance(ctx, instanceSlug, user.OrganizationID)
	if err != nil {
		return nil, err
	}
	rows, err := db.New(h.deps.Uof.DBTX(ctx)).GetEntitlementsUsageForInstanceWithFallback(ctx, db.GetEntitlementsUsageForInstanceWithFallbackParams{
		OrganizationID: user.OrganizationID, InstanceID: instance.ID,
	})
	if err != nil {
		return nil, err
	}
	usages, err := getentitlementsusagemetrics.MapUsageRows(rows)
	if err != nil {
		return nil, err
	}
	var over []string
	for _, usage := range usages {
		if usage.Value.Number == nil || usage.Limit == nil || usage.Limit.Number == nil || usage.Limit.Number.Value < 0 {
			continue
		}
		percent := 0.0
		if p := usage.LimitCapExceededOveragePercent; p != nil && *p > 0 {
			percent = float64(*p)
		}
		if usage.Value.Number.Value > usage.Limit.Number.Value*(1+percent/100) {
			over = append(over, usage.EntitlementSlug)
		}
	}
	return over, nil
}
