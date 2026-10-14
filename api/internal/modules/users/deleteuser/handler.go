package deleteuser

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/listusermemberships"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs. Memberships is the organization
// module's own port (see listusermemberships): which organizations the user
// occupies a seat in is that module's to answer.
type Deps struct {
	Queries       *db.Queries
	Memberships   *listusermemberships.UseCase
	UsageReporter services.UsageReporter
}

type UseCase struct {
	repository *CommandRepository
	deps       Deps
}

func NewUseCase(deps Deps) *UseCase {
	deps.UsageReporter = services.UsageReporterOrNoop(deps.UsageReporter)

	return &UseCase{repository: NewCommandRepository(deps.Queries), deps: deps}
}

// Execute soft-deletes a user by internal ID. Like deleteorganization and
// deletemembership, this is a privileged, cross-organization operation —
// authorized purely by the caller holding delete:users, which is why it lives on
// the Platform API.
//
// One user cannot be deleted: system:kaiten. A BEFORE UPDATE trigger raises
// restrict_violation, and that is translated here rather than pre-checked — a
// check-then-delete would be a race, and the invariant belongs to the database
// anyway. 403 and not 409: this is not a conflict the caller can resolve by
// retrying or reordering, it is an operation that is never permitted.
func (h *UseCase) Execute(ctx context.Context, userID uuid.UUID) error {
	// Read before the delete: a deleted user's memberships stay as they were, so
	// the list would be the same afterwards -- but a user that turns out not to
	// exist, or to be system:kaiten, must give nothing back, and that is only known
	// once the delete has answered.
	organizationIDs, err := h.deps.Memberships.Execute(ctx, userID)
	if err != nil {
		return err
	}

	existed, err := h.repository.DeleteUser(ctx, userID)
	if err != nil {
		if kaitenerrors.IsRestrictViolation(err) {
			return kaitenerrors.Wrap(err, kaitenerrors.KindForbidden,
				"DeleteUser.SystemIdentityProtected",
				"the system:kaiten platform identity cannot be deleted")
		}
		return fmt.Errorf("delete user: %w", err)
	}
	if !existed {
		return kaitenerrors.NotFound("DeleteUser.NotFound", fmt.Sprintf("User %q not found", userID))
	}

	// One seat per organization the user was a member of: each was counted when
	// sign-in provisioned that membership.
	for _, organizationID := range organizationIDs {
		h.deps.UsageReporter.DecrementAsync(organizationID, dogfooding.SeatEntitlementSlug)
	}

	return nil
}
