package updateinstance

import (
	"time"

	"github.com/google/uuid"
)

type Command struct {
	Name             string         `json:"name"`
	Description      string         `json:"description"`
	CustomerID       uuid.UUID      `json:"customerId"`
	LicenseID        uuid.UUID      `json:"licenseId"`
	DeploymentZoneID *uuid.UUID     `json:"deploymentZoneId,omitempty"`
	StartLicenseDate time.Time      `json:"startLicenseDate"`
	EndLicenseDate   time.Time      `json:"endLicenseDate"`
	Metadata         map[string]any `json:"metadata"`
	// Slug is nil when the caller did not ask for a rename, which leaves the
	// instance's current slug alone.
	Slug *string `json:"slug,omitempty"`
}
