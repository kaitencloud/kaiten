package graphql

import (
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// ErrMissingIdentity is returned when identity is not in context.
var ErrMissingIdentity = errors.New("missing identity in context")

func toReleaseSchema(r db.GetReleasesRow) schema.Release {
	return schema.Release{
		ID:          r.ID,
		Version:     r.Version,
		Slug:        r.Slug,
		Description: r.Description,
		CreatedBy:   shared.User{ID: r.CreatedByID, Name: r.CreatedByName},
		CreatedAt:   r.CreatedAt.Time,
	}
}

func toReleaseSchemasFromGetReleasesRows(releases []db.GetReleasesRow) []schema.Release {
	result := make([]schema.Release, len(releases))
	for i, r := range releases {
		result[i] = toReleaseSchema(r)
	}
	return result
}

func toReleaseSchemaFromGetOneReleaseBySlug(r db.GetOneReleaseBySlugRow) schema.Release {
	return schema.Release{
		ID:          r.ID,
		Version:     r.Version,
		Slug:        r.Slug,
		Description: r.Description,
		CreatedBy:   shared.User{ID: r.CreatedByID, Name: r.CreatedByName},
		CreatedAt:   r.CreatedAt.Time,
	}
}
