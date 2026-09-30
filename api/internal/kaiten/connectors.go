package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/activateconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/deactivateconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/deletesettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getconnectors"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getconnectorstate"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getsettingsschema"
	connectorschema "github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/updatesettings"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Connectors is what an ORGANIZATION can do with connectors: read the catalogue, and
// manage its own activation and settings for one of them.
//
// Registration is not here. It writes a deployment-wide table -- one row per
// connector, no organization column -- so it is a platform operation and lives on
// Platform.RegisterConnector; an organization credential authorizes authority over
// one organization, and spending that on the catalogue every other organization reads
// was the bug. Reading the registry stays here, because reading it is something an
// organization credential is allowed to do.
//
// The methods that act on the organization's own state say so in their names --
// Settings, Activate -- and the two that read the deployment-wide catalogue do not.
//
// See Customers for the naming and argument-order convention.
type Connectors struct {
	uc *connectors.UseCases
}

// Connectors returns the connectors surface.
func (k *Kaiten) Connectors() Connectors {
	return Connectors{uc: k.modules.Connectors}
}

func (c Connectors) Get(
	ctx context.Context, cl caller.OrganizationCaller, name string,
) (*connectorschema.Connector, error) {
	if err := cl.Require(getconnector.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.GetConnector.Execute(bindOrganization(ctx, cl), name)
}

// List returns every registered connector, unpaginated. That is the registry's
// shape rather than a facade shortcut: it holds one row per connector for the whole
// deployment, so there is no cursor for the transport to publish either.
func (c Connectors) List(
	ctx context.Context, cl caller.OrganizationCaller,
) ([]connectorschema.Connector, error) {
	if err := cl.Require(getconnectors.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.GetConnectors.Execute(bindOrganization(ctx, cl))
}

// GetState answers what this organization can do with one connector: whether the
// deployment has it, whether the licence includes it, and whether it is on.
//
// The three used to be one 404 on GetSettings, which is why this exists.
func (c Connectors) GetState(
	ctx context.Context, cl caller.OrganizationCaller, name string,
) (*connectorschema.ConnectorState, error) {
	if err := cl.Require(getconnectorstate.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.GetState.Execute(bindOrganization(ctx, cl), name)
}

// Activate turns a registered connector on for the caller's organization. Idempotent,
// and refused when the organization's licence does not include the connector.
func (c Connectors) Activate(
	ctx context.Context, cl caller.OrganizationCaller, name string,
) (*connectorschema.ConnectorActivation, error) {
	if err := cl.Require(activateconnector.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.Activate.Execute(bindOrganization(ctx, cl), name)
}

// Deactivate turns a connector off for the caller's organization. Idempotent, and
// never refused on entitlement grounds -- see the use case for why turning something
// off must not depend on still being allowed to have it on.
func (c Connectors) Deactivate(
	ctx context.Context, cl caller.OrganizationCaller, name string,
) error {
	if err := cl.Require(deactivateconnector.RequiredScope); err != nil {
		return err
	}

	return c.uc.Deactivate.Execute(bindOrganization(ctx, cl), name)
}

func (c Connectors) GetSettings(
	ctx context.Context, cl caller.OrganizationCaller, name string,
) (*connectorschema.ConnectorSettings, error) {
	if err := cl.Require(getsettings.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.GetSettings.Execute(bindOrganization(ctx, cl), name)
}

func (c Connectors) GetSettingsSchema(
	ctx context.Context, cl caller.OrganizationCaller, name string,
) (*connectorschema.ConnectorSettingsSchema, error) {
	if err := cl.Require(getsettingsschema.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.GetSchema.Execute(bindOrganization(ctx, cl), name)
}

func (c Connectors) UpdateSettings(
	ctx context.Context, cl caller.OrganizationCaller,
	name string, body connectorschema.ConnectorSettings,
) (*connectorschema.ConnectorSettings, error) {
	if err := cl.Require(updatesettings.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.UpdateSettings.Execute(bindOrganization(ctx, cl), name, body)
}

func (c Connectors) DeleteSettings(
	ctx context.Context, cl caller.OrganizationCaller, name string,
) error {
	if err := cl.Require(deletesettings.RequiredScope); err != nil {
		return err
	}

	return c.uc.DeleteSettings.Execute(bindOrganization(ctx, cl), name)
}
