package deletemembership

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	repository *CommandRepository
}

func NewUseCase(queries *db.Queries) *UseCase {
	return &UseCase{repository: NewCommandRepository(queries)}
}

// Execute soft-deletes a single user's membership on an organization. Like
// deleteorganization, this is a privileged, cross-organization operation —
// authorized purely by the caller holding delete:memberships, which is why it
// lives on the Platform API.
//
// system:kaiten's membership is the one it cannot remove. A BEFORE UPDATE
// trigger raises restrict_violation and this translates it; the only permitted
// way for that membership to go is deleting the organization, which takes it
// through the FK's ON DELETE CASCADE. Removing it by hand would leave the
// platform identity unable to mint a token for that tenant while the tenant
// still existed — the mint resolves an existing membership and never creates
// one.
func (h *UseCase) Execute(ctx context.Context, organizationID, userID uuid.UUID) error {
	existed, err := h.repository.DeleteMembership(ctx, organizationID, userID)
	if err != nil {
		if kaitenerrors.IsRestrictViolation(err) {
			return kaitenerrors.Wrap(err, kaitenerrors.KindForbidden,
				"DeleteMembership.SystemIdentityProtected",
				"the system:kaiten membership cannot be removed; delete the organization instead")
		}

		return fmt.Errorf("delete membership: %w", err)
	}
	if !existed {
		return kaitenerrors.NotFound("DeleteMembership.NotFound", fmt.Sprintf("Membership for user %q in organization %q not found", userID, organizationID))
	}

	return nil
}
