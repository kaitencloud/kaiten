// Package releaselink is the components module's public port for the
// release<->component linking operations the releases module needs
// (validating a referenced component exists, linking/unlinking it to a
// release, and reading back a release's components) -- consumed instead of
// releases reaching into this module's own generated db package directly.
//
// New binds to whatever uow.DBTX the caller passes, so releases can compose
// these calls into its own transaction exactly like it composes any other
// module's public Execute (see uow.UnitOfWork.Transact's doc comment).
package releaselink

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/infrastructure/db"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Port is the subset of components' persistence releases needs.
type Port interface {
	GetComponentByID(ctx context.Context, componentID, organizationID uuid.UUID) (*componentschema.Component, error)
	AddComponentToRelease(ctx context.Context, componentID, releaseID, organizationID uuid.UUID) error
	GetComponentsByReleaseID(ctx context.Context, releaseID, organizationID uuid.UUID) ([]componentschema.Component, error)
	RemoveAllComponentsFromRelease(ctx context.Context, releaseID, organizationID uuid.UUID) error
}

type port struct {
	queries *db.Queries
}

// New builds a Port bound to dbtx -- typically the caller's own
// uow.UnitOfWork.DBTX(ctx) from inside a Transact call, so these calls join
// the caller's transaction.
func New(dbtx uow.DBTX) Port {
	return &port{queries: db.New(dbtx)}
}

func (p *port) GetComponentByID(ctx context.Context, componentID, organizationID uuid.UUID) (*componentschema.Component, error) {
	component, err := p.queries.GetComponentByID(ctx, db.GetComponentByIDParams{
		ComponentID:    componentID,
		OrganizationID: organizationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("Component.NotFound", fmt.Sprintf("Component with ID %s not found", componentID))
		}
		return nil, err
	}

	return &componentschema.Component{
		ID:                  component.ID,
		PreviousComponentID: component.PreviousComponentID,
		Name:                component.Name,
		Version:             component.Version,
		Slug:                component.Slug,
		Description:         component.Description,
		CreatedBy:           shared.User{ID: component.CreatedByID, Name: component.CreatedByName},
		CreatedAt:           component.CreatedAt.Time,
	}, nil
}

func (p *port) AddComponentToRelease(ctx context.Context, componentID, releaseID, organizationID uuid.UUID) error {
	return p.queries.AddComponentToRelease(ctx, db.AddComponentToReleaseParams{
		ComponentID:    componentID,
		ReleaseID:      releaseID,
		OrganizationID: organizationID,
	})
}

func (p *port) GetComponentsByReleaseID(ctx context.Context, releaseID, organizationID uuid.UUID) ([]componentschema.Component, error) {
	rows, err := p.queries.GetComponentsByReleaseID(ctx, db.GetComponentsByReleaseIDParams{
		ReleaseID:      releaseID,
		OrganizationID: organizationID,
	})
	if err != nil {
		return nil, err
	}

	components := make([]componentschema.Component, len(rows))
	for i, row := range rows {
		components[i] = componentschema.Component{
			ID:                  row.ID,
			PreviousComponentID: row.PreviousComponentID,
			Name:                row.Name,
			Version:             row.Version,
			Slug:                row.Slug,
			Description:         row.Description,
			CreatedBy:           shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
			CreatedAt:           row.CreatedAt.Time,
		}
	}
	return components, nil
}

func (p *port) RemoveAllComponentsFromRelease(ctx context.Context, releaseID, organizationID uuid.UUID) error {
	return p.queries.RemoveAllComponentsFromRelease(ctx, db.RemoveAllComponentsFromReleaseParams{
		ReleaseID:      releaseID,
		OrganizationID: organizationID,
	})
}
