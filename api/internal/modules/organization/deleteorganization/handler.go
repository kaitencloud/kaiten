package deleteorganization

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	uof *uow.UnitOfWork
}

func NewUseCase(uof *uow.UnitOfWork) *UseCase {
	return &UseCase{uof: uof}
}

// Execute deletes the organization for real. Everything it owns — customers,
// licenses, feature flags, entitlements, instances, releases, memberships,
// service accounts and their tokens, its audit trail — goes with it through
// the ON DELETE CASCADE that every organization_id foreign key declares, so
// nothing is enumerated here and a table added later cannot be forgotten. It
// is irrecoverable: without a usage ledger the organization's usage history
// cannot be rebuilt.
//
// This is a privileged, cross-organization operation — the caller is
// authorized purely by holding delete:organizations, not by owning the target
// organization. That is why it lives on the Platform API: the target arrives in
// the path, the credential establishes only the identity system:kaiten, and no
// organization credential can reach it at all.
func (h *UseCase) Execute(ctx context.Context, organizationID uuid.UUID) error {
	return h.uof.Transact(ctx, func(ctx context.Context) error {
		txRepo := NewCommandRepository(db.New(h.uof.DBTX(ctx)))

		existed, err := txRepo.DeleteOrganization(ctx, organizationID)
		if err != nil {
			return fmt.Errorf("delete organization: %w", err)
		}
		if !existed {
			return kaitenerrors.NotFound("DeleteOrganization.NotFound", fmt.Sprintf("Organization %q not found", organizationID))
		}

		return nil
	})
}
