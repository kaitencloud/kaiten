package getlicense

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

func (r *QueryRepository) GetLicense(ctx context.Context, slug string, organizationID uuid.UUID) (*schema.License, error) {
	params := db.GetOneLicenseParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	result, err := r.repository.GetOneLicense(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("GetLicense.NotFound", fmt.Sprintf("License with slug %q not found", slug))
		}
		return nil, err
	}

	return dbmap.ToLicense(&result)
}
