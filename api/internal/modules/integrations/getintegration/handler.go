package getintegration

import (
	"context"

	customerintegrationsync "github.com/kaitencloud/kaiten/api/internal/modules/customers/integrationsync"
	instanceintegrationsync "github.com/kaitencloud/kaiten/api/internal/modules/instances/integrationsync"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/adapter"
	integrationschema "github.com/kaitencloud/kaiten/api/internal/modules/integrations/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. Customers and Instances are those modules' own public
// ports (see integrationsync) -- this module never imports their generated
// db packages directly.
type Deps struct {
	UserProvider currentuser.Provider
	Customers    customerintegrationsync.Port
	Instances    instanceintegrationsync.Port
}

type UseCase struct {
	deps Deps
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps}
}

func (h *UseCase) HandleCustomer(ctx context.Context, adapterName, externalID string) (*integrationschema.CustomerIntegrationResource, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	normalizedAdapter, err := adapter.Normalize(adapterName)
	if err != nil {
		return nil, err
	}

	customer, err := h.deps.Customers.GetByExternalID(ctx, user.OrganizationID, normalizedAdapter, externalID)
	if err != nil {
		return nil, err
	}

	return &integrationschema.CustomerIntegrationResource{
		Domain:   customer.Domain,
		Error:    customer.Integration.LastError,
		Metadata: customer.Integration.Metadata,
		Name:     customer.Name,
		Slug:     customer.Slug,
	}, nil
}

func (h *UseCase) HandleInstance(ctx context.Context, adapterName, externalID string) (*integrationschema.InstanceIntegrationResource, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	normalizedAdapter, err := adapter.Normalize(adapterName)
	if err != nil {
		return nil, err
	}

	instance, err := h.deps.Instances.GetByExternalID(ctx, user.OrganizationID, normalizedAdapter, externalID)
	if err != nil {
		return nil, err
	}

	return &integrationschema.InstanceIntegrationResource{
		CustomerExternalID: instance.CustomerExternalID,
		DeploymentZoneID:   instance.DeploymentZoneID,
		Description:        instance.Description,
		EndLicenseDate:     instance.EndLicenseDate,
		Error:              instance.Integration.LastError,
		LicenseID:          instance.LicenseID,
		Metadata:           instance.Metadata,
		Name:               instance.Name,
		Slug:               instance.Slug,
		StartLicenseDate:   instance.StartLicenseDate,
	}, nil
}
