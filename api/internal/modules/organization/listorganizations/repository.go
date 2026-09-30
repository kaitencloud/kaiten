package listorganizations

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{repository: repository}
}

func (r *QueryRepository) ListOrganizations(ctx context.Context) ([]organizationschema.Organization, error) {
	results, err := r.repository.GetAllOrganizations(ctx)
	if err != nil {
		return nil, fmt.Errorf("list organizations: %w", err)
	}

	// Non-nil even when there is nothing: a caller ranging over the result should
	// not have to distinguish "no organizations" from "no answer", and the error
	// return is what carries the second case.
	organizations := make([]organizationschema.Organization, 0, len(results))
	for _, result := range results {
		organizations = append(organizations, organizationschema.Organization{
			ID:         result.ID,
			ExternalID: result.ExternalID,
			Name:       result.Name,
		})
	}

	return organizations, nil
}
