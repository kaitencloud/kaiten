package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/deleteuser"
)

// registerUsers publishes the users module's one operation onto the Platform
// document.
//
// It has nothing on the Core one, which is the honest shape: users are
// JIT-provisioned from JWT claims and were never managed through /api, so
// deleting one -- global and privileged -- is the only operation there is.
func registerUsers(platform huma.API, app kaiten.Platform) {
	deleteuser.RegisterEndpoint(platform, app)
}
