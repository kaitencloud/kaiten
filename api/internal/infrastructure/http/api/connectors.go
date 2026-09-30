package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/activateconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/deactivateconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/deletesettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getconnectors"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getconnectorstate"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/getsettingsschema"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registerconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/updatesettings"
)

// registerConnectors publishes the connectors module's operations across BOTH
// documents, which is why it is the one registrar taking two. It declares no webhook
// contracts: connector registration and settings are configuration, and nothing
// subscribes to them.
//
// The split is the module's own: registration writes the deployment-wide registry, so
// it is a platform operation, while everything else is something one organization
// does to its own state -- or reads off a catalogue an organization credential is
// allowed to read. The facade is where that stays visible; see kaiten.Connectors and
// kaiten.Platform.
func registerConnectors(core, platform huma.API, app kaiten.Connectors, platformApp kaiten.Platform) {
	registerconnector.RegisterEndpoint(platform, platformApp)
	getconnector.RegisterEndpoint(core, app)
	getconnectors.RegisterEndpoint(core, app)
	getconnectorstate.RegisterEndpoint(core, app)
	activateconnector.RegisterEndpoint(core, app)
	deactivateconnector.RegisterEndpoint(core, app)
	getsettings.RegisterEndpoint(core, app)
	getsettingsschema.RegisterEndpoint(core, app)
	updatesettings.RegisterEndpoint(core, app)
	deletesettings.RegisterEndpoint(core, app)
}
