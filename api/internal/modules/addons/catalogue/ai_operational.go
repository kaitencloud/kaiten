package catalogue

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

func RequireOperational(ctx context.Context, q *db.Queries, org, id uuid.UUID, policy aiusage.Policy) error {
	ctx = policy.ForOrganization(ctx, org)
	if policy.Enabled(ctx) {
		return nil
	}
	hasAI, err := q.AddonHasAI(ctx, db.AddonHasAIParams{OrganizationID: org, AddonID: id})
	if err != nil {
		return err
	}
	if hasAI {
		return policy.RequireEnabled(ctx)
	}
	return nil
}
