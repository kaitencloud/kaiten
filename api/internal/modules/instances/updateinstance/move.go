package updateinstance

import (
	"context"

	"github.com/google/uuid"
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
