package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/deletemembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/deleteorganization"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensureorganization"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/getorganization"
)

// registerOrganization publishes the organization module's four operations onto
// the Platform document, and nothing onto the Core one.
//
// Every operation this module has is a privileged, cross-organization one that
// authorizes on a scope alone, so all four belong to the Platform API rather than
// sitting on /api behind a scope any tenant credential could hold. AddMembership is
// an in-process port for identity/createserviceaccount and is not an operation at
// all.
//
// Three of the four take their organization from the path and are bound to it
// before they run. ensure-organization does not, and cannot: it is the operation
// that makes the organization those three go on to name.
//
// All four take the same kaiten.Platform value, which satisfies each one's own
// one-method interface. That is the point of declaring those interfaces in the
// slices: this function passes the whole platform surface and each operation can
// still only call the method it named.
func registerOrganization(platform huma.API, app kaiten.Platform) {
	ensureorganization.RegisterEndpoint(platform, app)
	getorganization.RegisterEndpoint(platform, app)
	deleteorganization.RegisterEndpoint(platform, app)
	deletemembership.RegisterEndpoint(platform, app)
}
