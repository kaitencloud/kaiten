package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/integrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/getintegration"
	integrationschema "github.com/kaitencloud/kaiten/api/internal/modules/integrations/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/upsertintegration"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Integrations resolves a customer or an instance through a third-party system's
// own identifier: an adapter name plus the external id that system knows the record
// by.
//
// Two use cases, four operations, and two scopes per use case -- reading a customer
// this way requires the customers read scope, reading an instance requires the
// instances one. The module is a lookup path, not a resource of its own, so the
// authority a caller needs is the authority over whatever it lands on. That is why
// the method names carry the resolved resource (GetCustomer, GetInstance) rather
// than dropping a noun the namespace does not have.
type Integrations struct {
	uc *integrations.UseCases
}

// Integrations returns the integrations surface.
func (k *Kaiten) Integrations() Integrations {
	return Integrations{uc: k.modules.Integrations}
}

func (i Integrations) GetCustomer(
	ctx context.Context, cl caller.OrganizationCaller, adapter, externalID string,
) (*integrationschema.CustomerIntegrationResource, error) {
	if err := cl.Require(getintegration.CustomerRequiredScope); err != nil {
		return nil, err
	}

	return i.uc.GetIntegration.HandleCustomer(bindOrganization(ctx, cl), adapter, externalID)
}

func (i Integrations) GetInstance(
	ctx context.Context, cl caller.OrganizationCaller, adapter, externalID string,
) (*integrationschema.InstanceIntegrationResource, error) {
	if err := cl.Require(getintegration.InstanceRequiredScope); err != nil {
		return nil, err
	}

	return i.uc.GetIntegration.HandleInstance(bindOrganization(ctx, cl), adapter, externalID)
}

// UpsertCustomer creates or partially updates the customer behind adapter +
// externalID. Fields absent from body are left as they are, which is why it takes
// the whole body rather than a Command: the distinction between "set to zero" and
// "not mentioned" is carried by the pointers in it.
func (i Integrations) UpsertCustomer(
	ctx context.Context, cl caller.OrganizationCaller,
	adapter, externalID string, body upsertintegration.CustomerBody,
) (*integrationschema.CustomerIntegrationResource, error) {
	if err := cl.Require(upsertintegration.CustomerRequiredScope); err != nil {
		return nil, err
	}

	return i.uc.UpsertIntegration.UpsertCustomer(bindOrganization(ctx, cl), adapter, externalID, body)
}

func (i Integrations) UpsertInstance(
	ctx context.Context, cl caller.OrganizationCaller,
	adapter, externalID string, body upsertintegration.InstanceBody,
) (*integrationschema.InstanceIntegrationResource, error) {
	if err := cl.Require(upsertintegration.InstanceRequiredScope); err != nil {
		return nil, err
	}

	return i.uc.UpsertIntegration.UpsertInstance(bindOrganization(ctx, cl), adapter, externalID, body)
}
