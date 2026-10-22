package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/deleteuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/getme"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/getuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/listusers"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/putauthorization"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/updateuser"
)

// registerUsers retains global deletion on the privileged Platform API.
func registerUsers(platform huma.API, app kaiten.Platform) {
	deleteuser.RegisterEndpoint(platform, app)
}

func registerCoreUsers(core huma.API, app kaiten.Users) {
	listusers.RegisterEndpoint(core, app)
	getuser.RegisterEndpoint(core, app)
	updateuser.RegisterEndpoint(core, app)
	putauthorization.RegisterEndpoint(core, app)
	getme.RegisterEndpoint(core, app)
}
