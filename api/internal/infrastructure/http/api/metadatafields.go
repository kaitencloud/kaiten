package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/archivemetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/createmetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/dryrunmetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/getmetadatafields"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/reordermetadatafields"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/unarchivemetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/updatemetadatafield"
)

// registerMetadataFields publishes the metadata fields module's seven operations
// and the five webhook contracts its writes emit.
//
// Every write declares one, reordering included -- the order of a resource's
// fields is part of what a subscriber rendering them needs to know. The two that
// do not are the list and the dry run, which changes nothing by definition.
//
// All seven receive the same value -- the facade's metadata fields surface -- and
// each takes it as its own one-method interface, so what an operation can reach is
// what it named.
func registerMetadataFields(core huma.API, app kaiten.MetadataFields) {
	createmetadatafield.RegisterEndpoint(core, app)
	createmetadatafield.RegisterWebhook(core)
	updatemetadatafield.RegisterEndpoint(core, app)
	updatemetadatafield.RegisterWebhook(core)
	archivemetadatafield.RegisterEndpoint(core, app)
	archivemetadatafield.RegisterWebhook(core)
	unarchivemetadatafield.RegisterEndpoint(core, app)
	unarchivemetadatafield.RegisterWebhook(core)
	getmetadatafields.RegisterEndpoint(core, app)
	reordermetadatafields.RegisterEndpoint(core, app)
	reordermetadatafields.RegisterWebhook(core)
	dryrunmetadatafield.RegisterEndpoint(core, app)
}
