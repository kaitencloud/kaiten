package getlicensevalidation

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Queries is the existing org-scoped instance lookup and database clock. Using
// the same time source as entitlement windows keeps decisions across replicas
// aligned; callers never supply the instant being evaluated.
type Queries interface {
	GetOneInstance(context.Context, db.GetOneInstanceParams) (db.GetOneInstanceRow, error)
	GetDatabaseNow(context.Context) (pgtype.Timestamp, error)
}

type Deps struct {
	UserProvider currentuser.Provider
	Queries      Queries
}

type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }

func (h *UseCase) Execute(ctx context.Context, slug string) (*schema.LicenseValidation, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	instance, err := h.deps.Queries.GetOneInstance(ctx, db.GetOneInstanceParams{
		OrganizationID: user.OrganizationID, Slug: slug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("GetInstanceLicenseValidation.NotFound", fmt.Sprintf("Instance with slug %q not found", slug))
		}
		return nil, err
	}

	now, err := h.deps.Queries.GetDatabaseNow(ctx)
	if err != nil {
		return nil, err
	}
	if !now.Valid {
		return nil, fmt.Errorf("instance %q: database clock is invalid", slug)
	}
	if !instance.StartLicenseDate.Valid || !instance.EndLicenseDate.Valid {
		return nil, fmt.Errorf("instance %q: stored license term is incomplete", slug)
	}
	if instance.LicenseSlug == nil {
		return nil, fmt.Errorf("instance %q: assigned license slug is missing", slug)
	}
	evaluatedAt := now.Time.UTC()
	start := instance.StartLicenseDate.Time.UTC()
	end := instance.EndLicenseDate.Time.UTC()
	status := schema.LicenseTermActive
	switch {
	case !evaluatedAt.Before(end):
		status = schema.LicenseTermExpired
	case evaluatedAt.Before(start):
		status = schema.LicenseTermNotStarted
	}

	return &schema.LicenseValidation{
		Valid:            status == schema.LicenseTermActive,
		Status:           status,
		EvaluatedAt:      evaluatedAt,
		InstanceSlug:     instance.Slug,
		LicenseID:        instance.LicenseID,
		LicenseSlug:      *instance.LicenseSlug,
		StartLicenseDate: start,
		EndLicenseDate:   end,
	}, nil
}
