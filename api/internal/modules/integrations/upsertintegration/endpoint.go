package upsertintegration

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	integrationschema "github.com/kaitencloud/kaiten/api/internal/modules/integrations/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Upserter is the pair of facade methods this file's two operations call. Declared
// here rather than imported: internal/kaiten holds this use case, so naming it would
// close a cycle.
//
// Two methods on one interface because one use case backs two operations, each with
// its own scope.
type Upserter interface {
	UpsertCustomer(
		ctx context.Context, cl caller.OrganizationCaller,
		adapter, externalID string, body CustomerBody,
	) (*integrationschema.CustomerIntegrationResource, error)
	UpsertInstance(
		ctx context.Context, cl caller.OrganizationCaller,
		adapter, externalID string, body InstanceBody,
	) (*integrationschema.InstanceIntegrationResource, error)
}

type CustomerBody struct {
	Domain              *string        `json:"domain,omitempty" doc:"Optional customer domain name" example:"example.tld" pattern:"^[a-z0-9_-]+(\\.[a-z0-9_-]+)+$"`
	Error               *string        `json:"error,omitempty" doc:"Optional integration error message"`
	IntegrationMetadata map[string]any `json:"integrationMetadata,omitempty" doc:"Adapter-specific integration metadata"`
	Name                *string        `json:"name,omitempty" doc:"Customer name" example:"Awesome Customer" minLength:"1"`
	Slug                *string        `json:"slug,omitempty" doc:"Customer slug" example:"awesome-customer" minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	WebURL              *string        `json:"webUrl,omitempty" doc:"Absolute http(s) link to the record in the third-party system" example:"https://app.attio.com/w/acme/record/rec_12345"`
}

type UpsertCustomerRequest struct {
	Adapter    string `path:"adapter" doc:"Integration adapter without the kaiten.integration. prefix" example:"crm.attio"`
	ExternalID string `path:"externalId" doc:"External identifier in the third-party system" example:"rec_12345"`
	Body       CustomerBody
}

type UpsertCustomerResponse struct {
	Body *integrationschema.CustomerIntegrationResource
}

type InstanceBody struct {
	CustomerExternalID  *string        `json:"customerExternalId,omitempty" doc:"External identifier of the related customer in the same adapter" example:"rec_customer_123"`
	DeploymentZoneID    *uuid.UUID     `json:"deploymentZoneId,omitempty" doc:"Deployment zone ID" example:"123e4567-e89b-12d3-a456-426614174005"`
	Description         *string        `json:"description,omitempty" doc:"Instance description" example:"This is a sample instance description"`
	EndLicenseDate      *time.Time     `json:"endLicenseDate,omitempty" doc:"License end date" example:"2024-10-01T12:00:00Z"`
	Error               *string        `json:"error,omitempty" doc:"Optional integration error message"`
	IntegrationMetadata map[string]any `json:"integrationMetadata,omitempty" doc:"Adapter-specific integration metadata"`
	LicenseID           *uuid.UUID     `json:"licenseId,omitempty" doc:"License ID" example:"123e4567-e89b-12d3-a456-426614174004"`
	Metadata            map[string]any `json:"metadata,omitempty" doc:"Instance metadata"`
	Name                *string        `json:"name,omitempty" doc:"Instance name" example:"My Instance" minLength:"1"`
	Slug                *string        `json:"slug,omitempty" doc:"Instance slug" example:"my-instance" minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	StartLicenseDate    *time.Time     `json:"startLicenseDate,omitempty" doc:"License start date" example:"2023-10-01T12:00:00Z"`
	WebURL              *string        `json:"webUrl,omitempty" doc:"Absolute http(s) link to the record in the third-party system" example:"https://app.attio.com/w/acme/record/rec_12345"`
}

type UpsertInstanceRequest struct {
	Adapter    string `path:"adapter" doc:"Integration adapter without the kaiten.integration. prefix" example:"crm.attio"`
	ExternalID string `path:"externalId" doc:"External identifier in the third-party system" example:"rec_12345"`
	Body       InstanceBody
}

type UpsertInstanceResponse struct {
	Body *integrationschema.InstanceIntegrationResource
}

func RegisterEndpoint(api huma.API, app Upserter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "upsert-customer-integration-by-external-id",
		Method:        http.MethodPatch,
		Path:          "/integration/{adapter}/customer/{externalId}",
		Summary:       "Upsert a customer by integration external ID",
		Description:   "Create or partially update a customer resolved through adapter + external ID. Missing fields are left unchanged.",
		Tags:          []string{"integrations", "customers"},
		DefaultStatus: http.StatusOK,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, CustomerRequiredScope, func(ctx context.Context, request *UpsertCustomerRequest) (*UpsertCustomerResponse, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		resource, err := app.UpsertCustomer(ctx, cl, request.Adapter, request.ExternalID, request.Body)
		if err != nil {
			return nil, err
		}
		return &UpsertCustomerResponse{Body: resource}, nil
	})

	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "upsert-instance-integration-by-external-id",
		Method:        http.MethodPatch,
		Path:          "/integration/{adapter}/instance/{externalId}",
		Summary:       "Upsert an instance by integration external ID",
		Description:   "Create or partially update an instance resolved through adapter + external ID. Missing fields are left unchanged.",
		Tags:          []string{"integrations", "instances"},
		DefaultStatus: http.StatusOK,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, InstanceRequiredScope, func(ctx context.Context, request *UpsertInstanceRequest) (*UpsertInstanceResponse, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		resource, err := app.UpsertInstance(ctx, cl, request.Adapter, request.ExternalID, request.Body)
		if err != nil {
			return nil, err
		}
		return &UpsertInstanceResponse{Body: resource}, nil
	})
}
