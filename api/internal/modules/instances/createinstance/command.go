package createinstance

import (
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
)

type Command struct {
	Name             string                                `json:"name"`
	Description      string                                `json:"description"`
	CustomerID       uuid.UUID                             `json:"customerId"`
	LicenseID        uuid.UUID                             `json:"licenseId"`
	DeploymentZoneID *uuid.UUID                            `json:"deploymentZoneId,omitempty"`
	StartLicenseDate time.Time                             `json:"startLicenseDate"`
	EndLicenseDate   time.Time                             `json:"endLicenseDate"`
	Metadata         map[string]interface{}                `json:"metadata"`
	Integrations     map[string]schema.InstanceIntegration `json:"integrations,omitempty"`
	Slug             *string                               `json:"slug,omitempty"`
}
