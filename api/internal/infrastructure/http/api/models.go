package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/createmodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/deletemodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/getmodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/listmodels"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/updatemodel"
)

func registerModels(core huma.API, app kaiten.Models) {
	createmodel.RegisterEndpoint(core, app)
	createmodel.RegisterWebhook(core)
	getmodel.RegisterEndpoint(core, app)
	listmodels.RegisterEndpoint(core, app)
	updatemodel.RegisterEndpoint(core, app)
	updatemodel.RegisterWebhook(core)
	deletemodel.RegisterEndpoint(core, app)
	deletemodel.RegisterWebhook(core)
}
