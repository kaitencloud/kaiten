package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/createrole"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/deleterole"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/deleteuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/getme"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/getuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/listroles"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/listusers"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/putauthorization"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/setuserassignments"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/setuserenabled"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/updaterole"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/updateuser"
)

// registerUsers retains global deletion on the privileged Platform API.
func registerUsers(platform huma.API, app kaiten.Platform) {
	deleteuser.RegisterEndpoint(platform, app)
}

func registerCoreUsers(core huma.API, app kaiten.Users) {
	listroles.RegisterEndpoint(core, app)
	createrole.RegisterEndpoint(core, app)
	updaterole.RegisterEndpoint(core, app)
	deleterole.RegisterEndpoint(core, app)
	setuserenabled.RegisterEndpoint(core, app)
	setuserassignments.RegisterEndpoint(core, app)
	listusers.RegisterEndpoint(core, app)
	getuser.RegisterEndpoint(core, app)
	updateuser.RegisterEndpoint(core, app)
	putauthorization.RegisterEndpoint(core, app)
	getme.RegisterEndpoint(core, app)
}
