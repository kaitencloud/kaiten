package createdeployment

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	deploymentZoneEvents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this service needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
}

type Service struct {
	deps Deps
}

func NewService(deps Deps) *Service {
	return &Service{deps: deps}
}

// CreateDeployment must run inside a transaction its caller already opened
// -- it has no top-level use case of its own (see createdeploymentzone and
// updatedeploymentzone, its only two callers). ctx is expected to already
// carry that transaction, so Queries(ctx) resolves the same tx-bound
// *sqlc.Queries the caller's own repositories are using: both callers need
// the deployment write to land or roll back together with the
// deployment-zone write happening alongside it in the same transaction.
func (s *Service) CreateDeployment(ctx context.Context, deploymentZoneID uuid.UUID, releaseID uuid.UUID) (*schema.Deployment, error) {
	u, err := s.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	txRepo := NewCommandRepository(db.New(s.deps.Uof.DBTX(ctx)))
	txOutbox := outbox.NewOutboxRepository(outboxdb.New(s.deps.Uof.DBTX(ctx)))

	deploymentResult, err := txRepo.CreateDeployment(ctx, deploymentZoneID, releaseID, u.OrganizationID, u.ID)
	if err != nil {
		return nil, err
	}

	event := outbox.NewOutboxMessage(
		u.OrganizationID,
		deploymentZoneEvents.ReleaseDeployed.Name,
		deploymentZoneEvents.ReleaseDeployed.Type,
		deploymentResult,
		nil,
	)

	if err := txOutbox.CreateOutboxEvent(ctx, event); err != nil {
		return nil, err
	}

	return deploymentResult, nil
}
