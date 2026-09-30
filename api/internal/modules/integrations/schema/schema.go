package schema

import (
	"time"

	"github.com/google/uuid"
)

type CustomerIntegrationResource struct {
	Domain   *string        `json:"domain,omitempty" doc:"Optional customer domain name" example:"example.tld"`
	Error    *string        `json:"error,omitempty" doc:"Last synchronization error for this integration, if any"`
	Metadata map[string]any `json:"integrationMetadata" doc:"Adapter-specific customer integration metadata"`
	Name     string         `json:"name" doc:"Customer name" example:"Awesome Customer"`
	Slug     string         `json:"slug" doc:"Customer slug" example:"awesome-customer"`
	WebURL   *string        `json:"webUrl,omitempty" doc:"Absolute http(s) link to the record in the third-party system" example:"https://app.attio.com/w/acme/company/rec_12345"`
}

type InstanceIntegrationResource struct {
	CustomerExternalID *string        `json:"customerExternalId,omitempty" doc:"External identifier of the related customer in the same adapter" example:"rec_customer_123"`
	DeploymentZoneID   *uuid.UUID     `json:"deploymentZoneId,omitempty" doc:"Deployment zone ID" example:"123e4567-e89b-12d3-a456-426614174005"`
	Description        string         `json:"description" doc:"Instance description" example:"This is a sample instance description"`
	EndLicenseDate     time.Time      `json:"endLicenseDate" doc:"License end date" example:"2024-10-01T12:00:00Z"`
	Error              *string        `json:"error,omitempty" doc:"Last synchronization error for this integration, if any"`
	LicenseID          uuid.UUID      `json:"licenseId" doc:"License ID" example:"123e4567-e89b-12d3-a456-426614174004"`
	Metadata           map[string]any `json:"integrationMetadata" doc:"Adapter-specific instance integration metadata"`
	Name               string         `json:"name" doc:"Instance name" example:"My Instance"`
	Slug               string         `json:"slug" doc:"Instance slug" example:"my-instance"`
	StartLicenseDate   time.Time      `json:"startLicenseDate" doc:"License start date" example:"2023-10-01T12:00:00Z"`
	WebURL             *string        `json:"webUrl,omitempty" doc:"Absolute http(s) link to the record in the third-party system" example:"https://app.attio.com/w/acme/workspace/rec_12345"`
}
