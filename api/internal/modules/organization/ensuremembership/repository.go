package ensuremembership

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
)

type CommandRepository struct {
	repository *db.Queries
}

func NewCommandRepository(repository *db.Queries) *CommandRepository {
	return &CommandRepository{repository: repository}
}

// EnsureUserOnOrganization upserts the membership and returns the row's
// deleted_at: nil for a membership that is live, whether it was just created or was
// already there.
//
// A *time.Time rather than the column's pgtype.Timestamp, so the persistence type
// stops at this file -- the rule the caller applies is "is this membership
// deleted", which needs no knowledge of how a nullable timestamp is spelled in the
// driver.
func (r *CommandRepository) EnsureUserOnOrganization(
	ctx context.Context, userID, organizationID uuid.UUID,
) (*time.Time, error) {
	deletedAt, err := r.repository.EnsureUserOnOrganization(ctx, db.EnsureUserOnOrganizationParams{
		UserID:         userID,
		OrganizationID: organizationID,
	})
	if err != nil {
		return nil, fmt.Errorf("ensure user_on_organization: %w", err)
	}

	return pgtime.PgTimeStampToTimePtr(deletedAt), nil
}
