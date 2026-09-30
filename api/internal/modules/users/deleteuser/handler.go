package deleteuser

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	repository *CommandRepository
}

func NewUseCase(queries *db.Queries) *UseCase {
	return &UseCase{repository: NewCommandRepository(queries)}
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
	return nil
}
