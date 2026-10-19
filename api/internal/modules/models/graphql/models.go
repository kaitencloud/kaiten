// Package graphql is the model catalogue's organization-scoped read surface.
package graphql

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/models/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Models returns the whole catalogue for the matrix, not just its first REST
// page. The GraphQL scope gate requires read:models before reaching this query.
func Models(ctx context.Context, queries *db.Queries, status *schema.Status) ([]schema.Model, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, apierrors.Unauthorized("Auth.NoIdentity", "no identity found in context")
	}
	rows, err := queries.AllModels(ctx, db.AllModelsParams{OrganizationID: i.OrganizationID, Status: (*db.ModelStatus)(status)})
	if err != nil {
		return nil, err
	}
	models, err := catalogue.Present(ctx, queries, i.OrganizationID, rows)
	if err != nil {
		return nil, err
	}
	result := make([]schema.Model, 0, len(models))
	for _, model := range models {
		result = append(result, *model)
	}
	return result, nil
}
