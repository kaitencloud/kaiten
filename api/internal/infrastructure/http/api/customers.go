package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/deletecustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/deleteintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomers"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/updatecustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/updateintegrations"
)

// registerCustomers publishes the customers module's nine operations, and the
// four webhook contracts its three writes emit -- create declares two, because a
// creation refused by the entitlement cap is an event of its own.
//
// Every operation takes the same kaiten.Customers value, which satisfies each one's
// own one-method interface. That is the point of declaring those interfaces in the
// slices: this function passes the whole namespace and each operation can still only
// call the method it named.
func registerCustomers(core huma.API, app kaiten.Customers) {
	createintegrations.RegisterEndpoint(core, app)
	createcustomer.RegisterEndpoint(core, app)
	createcustomer.RegisterWebhook(core)
	deleteintegrations.RegisterEndpoint(core, app)
	deletecustomer.RegisterEndpoint(core, app)
	deletecustomer.RegisterWebhook(core)
	getintegrations.RegisterEndpoint(core, app)
	getcustomer.RegisterEndpoint(core, app)
	getcustomers.RegisterEndpoint(core, app)
	updateintegrations.RegisterEndpoint(core, app)
	updatecustomer.RegisterEndpoint(core, app)
	updatecustomer.RegisterWebhook(core)
}
