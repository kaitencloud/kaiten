// Package addmembership is the organization module's public port for
// creating a user_on_organization row from outside the module -- e.g.
// identity/createserviceaccount, which needs a service account's own
// membership row created as part of its own atomic creation flow. It has no
// endpoint.go, which is what says it is not published: nothing registers it and
// it appears in no OpenAPI document.
package addmembership

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
)

type UseCase struct {
	uof *uow.UnitOfWork
}

func NewUseCase(uof *uow.UnitOfWork) *UseCase {
	return &UseCase{uof: uof}
}

// Execute creates a membership row for userID on organizationID. Callers
// already inside a Transact call (see uow.UnitOfWork.Transact's doc
// comment) can pass that same ctx through: this joins the caller's
// transaction instead of opening a new one, so the membership is created
// atomically with whatever else the caller is persisting.
//
// This is the only deliberate, API-driven way a membership is created, as
// opposed to organization/ensuremembership's JIT path (composed into
// users/ensureuser, see ensureuser/handler.go, and reached through
// k.InProcess), which runs on the authentication path of every request.
//
// Neither reports usage: JIT is how every human membership is actually created,
// so a count taken here would never reflect real headcount.
func (h *UseCase) Execute(ctx context.Context, userID, organizationID uuid.UUID) error {
	return h.uof.Transact(ctx, func(ctx context.Context) error {
		repo := NewCommandRepository(db.New(h.uof.DBTX(ctx)))
		if err := repo.CreateUserOnOrganization(ctx, userID, organizationID); err != nil {
			return fmt.Errorf("create user_on_organization: %w", err)
		}
		return nil
	})
}
