package suggestusers

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{repository: repository}
}

func (r *QueryRepository) SuggestUsers(
	ctx context.Context, externalIDPrefix string, limit int32,
) ([]Candidate, error) {
	results, err := r.repository.ListLiveUsersByExternalIDPrefix(ctx,
		db.ListLiveUsersByExternalIDPrefixParams{
			ExternalIDPrefix: &externalIDPrefix,
			MaxResults:       limit,
		})
	if err != nil {
		return nil, fmt.Errorf("suggest users: %w", err)
	}

	// Non-nil even when nothing matched, for the reason listorganizations gives: a
	// caller ranging over the result should not have to tell "nothing matches this
	// prefix" from "no answer", and the error return is what carries the second.
	candidates := make([]Candidate, 0, len(results))
	for _, result := range results {
		candidates = append(candidates, Candidate{
			ExternalID: result.ExternalID,
			Name:       result.Name,
			Email:      result.Email,
		})
	}

	return candidates, nil
}
