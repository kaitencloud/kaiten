// Package ensuremembership is the organization module's port for the membership
// half of provisioning: it converges on a user_on_organization row without
// resurrecting one that was deliberately removed, and refuses the caller when the
// membership it found is soft-deleted.
//
// Separate from addmembership, this module's other membership port, because the two
// differ on the one thing that matters here. addmembership resurrects
// (ON CONFLICT ... SET deleted_at = NULL); this one does not. A user removed from
// an organization stays removed, and presenting a fresh token does not undo it --
// re-joining is an explicit operation, not a side effect of authenticating. Which
// port a caller wants is decided by whether a human asked for the membership.
//
// The refusal lives here rather than in the caller because the rule is this
// module's: `user_on_organization` is the organization module's table, and "a
// removed member is not a member" is a statement about that table. users/ensureuser
// composes this port and propagates what it says.
//
// No endpoint.go: nothing publishes this, and nothing could -- its only caller runs
// before any credential exists.
package ensuremembership

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	uof *uow.UnitOfWork
}

// NewUseCase takes the unit of work rather than a pool-bound *db.Queries, for the
// same reason addmembership does: its caller is mid-transaction, and the
// membership has to land in that transaction or not at all.
func NewUseCase(uof *uow.UnitOfWork) *UseCase {
	return &UseCase{uof: uof}
}

// Execute creates the membership if it is missing and leaves an existing one
// exactly as it found it, including a soft-deleted one.
//
// Callers already inside a Transact call can pass that same ctx through: this
// joins the caller's transaction instead of opening a new one (see
// uow.UnitOfWork.Transact), so the membership is created atomically with whatever
// else the caller is persisting -- and the Forbidden below rolls that work back
// with it, which is what makes a refused login leave no trace of the user it
// refused.
func (h *UseCase) Execute(ctx context.Context, userID, organizationID uuid.UUID) error {
	return h.uof.Transact(ctx, func(ctx context.Context) error {
		repo := NewCommandRepository(db.New(h.uof.DBTX(ctx)))

		deletedAt, err := repo.EnsureUserOnOrganization(ctx, userID, organizationID)
		if err != nil {
			return err
		}
		if deletedAt != nil {
			// Verbatim the code and message JIT provisioning has always answered a
			// removed member with: it reaches an HTTP client on the first-login path,
			// and rewording it would change a response nothing asked to change.
			return kaitenerrors.Forbidden(
				"Auth.MembershipDeleted",
				"User has been removed from the organization",
			)
		}

		return nil
	})
}
