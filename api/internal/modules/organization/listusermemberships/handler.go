// Package listusermemberships answers which organizations a user is a live member
// of. It is the organization module's port for the users module, which needs the
// answer when a user is deleted -- each of those memberships was a seat -- and owns
// none of the rows that hold it.
//
// No endpoint: its one caller is another module's use case, like ensuremembership's.
package listusermemberships

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
)

type UseCase struct {
	queries *db.Queries
}

// NewUseCase takes the connection rather than the module's generated queries, so
// the users module that composes it never imports organization's db package.
func NewUseCase(conn db.DBTX) *UseCase {
	return &UseCase{queries: db.New(conn)}
}

// Execute returns the organizations userID is a live member of, in a stable order.
// A removed membership is not one: the seat it held was already given back.
func (h *UseCase) Execute(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	organizationIDs, err := h.queries.ListActiveOrganizationIDsForUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list the organizations of user %q: %w", userID, err)
	}

	return organizationIDs, nil
}
