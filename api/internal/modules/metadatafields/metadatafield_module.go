package metadatafields

import (
	"context"
	"log/slog"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	deploymentzonedryrunlist "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/dryrunlist"
	instancedryrunlist "github.com/kaitencloud/kaiten/api/internal/modules/instances/dryrunlist"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/archivemetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/createmetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/dryrunmetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/getmetadatafields"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/reordermetadatafields"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/unarchivemetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/updatemetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
)

// UseCases aggregates all use cases for the metadatafields module.
type UseCases struct {
	CreateMetadataField    *createmetadatafield.UseCase
	UpdateMetadataField    *updatemetadatafield.UseCase
	ArchiveMetadataField   *archivemetadatafield.UseCase
	UnarchiveMetadataField *unarchivemetadatafield.UseCase
	GetMetadataFields      *getmetadatafields.UseCase
	ReorderMetadataFields  *reordermetadatafields.UseCase
	DryRunMetadataField    *dryrunmetadatafield.UseCase
}

// NewUseCases instantiates the metadatafields module with all dependencies wired.
func NewUseCases(svc services.Container) *UseCases {
	// Cross-replica invalidation: every write handler below NOTIFYs
	// validator.InvalidationChannel after evicting its own local cache
	// entry (see validator.InvalidateAndPublish); every replica, including
	// the one that made the write, applies the same eviction in response.
	// See validator/cache.go for the (org, resourceType) cache this guards.
	//
	// This module owns its own pgnotify.Listener -- built, registered, and
	// started right here, the same way featureflags_module.go's
	// evaluationPublisher owns its own background worker -- rather than
	// sharing one built and started by the server.
	if listener := svc.NewPgNotifyListener("metadatafields"); listener != nil {
		listener.Register(validator.InvalidationChannel, func(_ context.Context, payload string) {
			validator.ApplyInvalidation(payload)
		})
		if err := listener.Start(context.Background()); err != nil {
			slog.Error("metadatafields: failed to start pgnotify listener; schema cache invalidation falls back to TTL-only staleness", "error", err)
		} else {
			svc.WorkerRegistry.OnStop(listener.Stop)
		}
	}

	queries := db.New(svc.Pool)
	return &UseCases{
		CreateMetadataField: createmetadatafield.NewUseCase(createmetadatafield.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		UpdateMetadataField: updatemetadatafield.NewUseCase(updatemetadatafield.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		ArchiveMetadataField: archivemetadatafield.NewUseCase(archivemetadatafield.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		UnarchiveMetadataField: unarchivemetadatafield.NewUseCase(unarchivemetadatafield.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		GetMetadataFields: getmetadatafields.NewUseCase(getmetadatafields.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		ReorderMetadataFields: reordermetadatafields.NewUseCase(reordermetadatafields.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
		}),
		DryRunMetadataField: dryrunmetadatafield.NewUseCase(dryrunmetadatafield.Deps{
			UserProvider:         svc.UserProvider,
			Queries:              queries,
			DeploymentZoneLister: deploymentzonedryrunlist.New(svc.Pool),
			InstanceLister:       instancedryrunlist.New(svc.Pool),
		}),
	}
}
