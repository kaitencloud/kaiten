package getrelease

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/components/releaselink"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// QueryRepository composes this module's own db.Queries with the
// components module's public releaselink.Port -- it never imports
// components' own generated db package directly.
type QueryRepository struct {
	repository    *db.Queries
	componentLink releaselink.Port
}

func NewQueryRepository(repository *db.Queries, componentLink releaselink.Port) *QueryRepository {
	return &QueryRepository{
		repository:    repository,
		componentLink: componentLink,
	}
}

func (r *QueryRepository) GetReleaseBySlug(ctx context.Context, slug string, organizationID uuid.UUID) (*schema.Release, error) {
	params := db.GetOneReleaseBySlugParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	rl, err := r.repository.GetOneReleaseBySlug(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("Release.NotFound", fmt.Sprintf("Release with slug %q not found in organization %s", slug, organizationID))
		}
		return nil, err
	}

	// Fetch components for this release
	components, err := r.componentLink.GetComponentsByReleaseID(ctx, rl.ID, organizationID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch components: %w", err)
	}

	return &schema.Release{
		ID:          rl.ID,
		Version:     rl.Version,
		Slug:        rl.Slug,
		Description: rl.Description,
		CreatedBy:   shared.User{ID: rl.CreatedByID, Name: rl.CreatedByName},
		CreatedAt:   rl.CreatedAt.Time,
		Components:  components,
	}, nil
}
