// Package listplatformtokens reports every platform credential this deployment has
// ever issued.
//
// It has no endpoint.go, and could not have one. The Platform API's own read of a
// credential is getplatformcredential, which answers "who am I" about the
// credential the caller is holding -- one row, the caller's own, and nothing about
// whether any other exists. This is the opposite: an inventory, including revoked
// and expired rows, which is the enumeration the Platform API's invisibility rules
// exist to prevent. Publishing it would let one credential discover that others
// exist, when they were created, and what authority they carry. Reachable only
// through kaiten.InProcess.
//
// Revoked and expired rows are included deliberately: a retired credential's
// absence would hide exactly the history an operator needs after a rotation, which
// is the one moment they are most likely to be looking.
package listplatformtokens

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. A pool-bound *db.Queries, like this module's other read
// paths: one statement, nothing to keep atomic.
type Deps struct {
	Queries *db.Queries
}

type UseCase struct {
	deps Deps
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps}
}

// Execute returns the inventory, newest first as the query orders it.
//
// Carries no hash and no lookup hash: neither is a credential, but both are derived
// from one, and a read path has no use for either. The value itself existed only at
// creation (see createplatformtoken).
func (h *UseCase) Execute(ctx context.Context) ([]schema.PlatformToken, error) {
	rows, err := h.deps.Queries.ListPlatformTokens(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list the platform credentials: %w", err)
	}

	tokens := make([]schema.PlatformToken, 0, len(rows))
	for _, row := range rows {
		tokens = append(tokens, schema.PlatformToken{
			ID:        row.ID,
			Name:      row.Name,
			Slug:      row.Slug,
			Scopes:    row.Scopes,
			CreatedAt: row.CreatedAt.Time,
			ExpiresAt: pgtime.PgTimeStampToTimePtr(row.ExpiresAt),
			// revoked_date on the row, RevokedAt here: the column is named for the
			// timestamp it holds, the domain type for the question it answers.
			RevokedAt: pgtime.PgTimeStampToTimePtr(row.RevokedDate),
		})
	}

	return tokens, nil
}
