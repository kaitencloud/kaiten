// Package resolveuser turns the external id an identity provider issued into the
// internal id every other user operation takes.
//
// It has no endpoint.go and could not acquire one, for two reasons that stack.
// There is no get-user operation on either document, and the absence is a decision
// rather than an omission: a user is global, so a lookup keyed on a provider's
// subject answers "does this person hold an account on this deployment" to whatever
// credential can reach it — the cross-tenant question the Platform API's
// invisibility rules exist to refuse. And a client on the wire needs no such
// lookup, because pkg/externalid.DeriveUserID is the public, client-side answer for
// every user JIT provisioning created, which is every user a tenant knows about.
//
// What this exists for is the rows this deployment created but did not derive:
// system:kaiten's id is pinned by migration, and each service account is minted with
// an id of its own. An operator naming one of those at a shell has nothing to derive
// from, and deriving anyway would produce a plausible uuid pointing at no row.
// Reachable only through kaiten.InProcess.
package resolveuser

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	repository *QueryRepository
}

func NewUseCase(queries *db.Queries) *UseCase {
	return &UseCase{repository: NewQueryRepository(queries)}
}

// Execute returns the internal id of the user this external id names.
//
// Soft-deleted users resolve like any other, which is a property of the query and
// not an oversight in it: a caller that resolves an id in order to delete it needs
// "the row is there and already gone" to be a different answer from "no such user",
// and filtering here would collapse the two into the same one.
func (h *UseCase) Execute(ctx context.Context, externalID string) (uuid.UUID, error) {
	userID, found, err := h.repository.ResolveUser(ctx, externalID)
	if err != nil {
		return uuid.Nil, err
	}
	if !found {
		return uuid.Nil, kaitenerrors.NotFound("ResolveUser.NotFound",
			fmt.Sprintf("user %q does not exist", externalID))
	}

	return userID, nil
}
