package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/archivelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deletelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deletelicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deprecatelicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseentitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicensefamily"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenses"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/listlicensefamilies"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/listlicenseprices"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/previewlicenseinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/publishlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/unarchivelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicenseprice"
)

// registerLicenses publishes the licenses module's twenty-one operations and the
// fifteen webhook contracts its writes emit -- six for the license itself (three of
// them lifecycle moves), three for the family it belongs to, three for the
// entitlement values attached to it, and three for its prices, since a subscriber
// cares which of them moved.
//
// All twenty-one receive the same value -- the facade's licenses surface -- and each
// takes it as its own one-method interface, so what an operation can reach is what
// it named.
func registerLicenses(core huma.API, app kaiten.Licenses) {
	createlicense.RegisterEndpoint(core, app)
	createlicense.RegisterWebhook(core)
	deletelicense.RegisterEndpoint(core, app)
	deletelicense.RegisterWebhook(core)
	listlicensefamilies.RegisterEndpoint(core, app)
	getlicensefamily.RegisterEndpoint(core, app)
	getlicensefamily.RegisterWebhooks(core)
	getlicense.RegisterEndpoint(core, app)
	getlicenses.RegisterEndpoint(core, app)
	updatelicense.RegisterEndpoint(core, app)
	updatelicense.RegisterWebhook(core)
	publishlicense.RegisterEndpoint(core, app)
	publishlicense.RegisterWebhook(core)
	archivelicense.RegisterEndpoint(core, app)
	archivelicense.RegisterWebhook(core)
	unarchivelicense.RegisterEndpoint(core, app)
	unarchivelicense.RegisterWebhook(core)
	associateentitlementwithlicense.RegisterEndpoint(core, app)
	associateentitlementwithlicense.RegisterWebhook(core)
	getlicenseentitlement.RegisterEndpoint(core, app)
	getlicenseentitlements.RegisterEndpoint(core, app)
	deletelicenseentitlement.RegisterEndpoint(core, app)
	deletelicenseentitlement.RegisterWebhook(core)
	updatelicenseentitlement.RegisterEndpoint(core, app)
	updatelicenseentitlement.RegisterWebhook(core)
	listlicenseprices.RegisterEndpoint(core, app)
	getlicenseprice.RegisterEndpoint(core, app)
	createlicenseprice.RegisterEndpoint(core, app)
	createlicenseprice.RegisterWebhook(core)
	updatelicenseprice.RegisterEndpoint(core, app)
	updatelicenseprice.RegisterWebhook(core)
	deprecatelicenseprice.RegisterEndpoint(core, app)
	deprecatelicenseprice.RegisterWebhook(core)
	previewlicenseinvoice.RegisterEndpoint(core, app)
}
