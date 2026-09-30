package api

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/getpreferences"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/listnotifications"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/markread"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/putpreferences"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/stream"
)

// registerNotifications mounts the feed, its read state, the preference matrix
// and the SSE stream.
//
// The stream goes on the Fiber router rather than the huma API for the same
// reason the OFREP endpoints do: it is not a request/response pair huma can
// describe, and pretending otherwise would publish a contract that lies about
// what the endpoint does.
func registerNotifications(core huma.API, router fiber.Router, app kaiten.Notifications) {
	listnotifications.RegisterEndpoint(core, app)
	markread.RegisterEndpoint(core, app)
	getpreferences.RegisterEndpoint(core, app)
	putpreferences.RegisterEndpoint(core, app)

	stream.RegisterEndpoint(router, app)
}
