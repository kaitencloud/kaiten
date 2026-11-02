package getinstance

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Queries reuses the organization-scoped resource lookup, integrations and the
// UTC database clock shared with entitlement windows.
type Queries interface {
	GetOneInstance(context.Context, db.GetOneInstanceParams) (db.GetOneInstanceRow, error)
	GetInstanceIntegrations(context.Context, db.GetInstanceIntegrationsParams) ([]db.GetInstanceIntegrationsRow, error)
	GetDatabaseNow(context.Context) (pgtype.Timestamp, error)
}

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider currentuser.Provider
	Queries      Queries
}

type UseCase struct {
	deps       Deps
	repository *QueryRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries),
	}
}

func (h *UseCase) Execute(ctx context.Context, slug string) (*schema.Instance, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	instance, err := h.repository.GetInstance(ctx, slug, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	now, err := h.deps.Queries.GetDatabaseNow(ctx)
	if err != nil {
		return nil, err
	}
	if !now.Valid {
		return nil, fmt.Errorf("instance %q: database clock is invalid", slug)
	}
	evaluatedAt := now.Time.UTC()
	status := schema.LicenseTermActive
	switch {
	case !evaluatedAt.Before(instance.EndLicenseDate):
		status = schema.LicenseTermExpired
	case evaluatedAt.Before(instance.StartLicenseDate):
		status = schema.LicenseTermNotStarted
	}
	instance.LicenseTerm = &schema.LicenseTerm{Status: status, EvaluatedAt: evaluatedAt}
	return instance, nil
}
