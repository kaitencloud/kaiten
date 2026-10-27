// Package listcheckoutsessions is GET /checkout-sessions (§13.18): the
// organization's anonymous checkouts, newest first, for a vendor that links
// its buyers by reading rather than by events.
package listcheckoutsessions

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getcheckoutsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Query narrows the list.
type Query struct {
	Statuses          []string
	Email             *string
	ClientReferenceID *string
	Cursor            string
	Limit             int32
}

type UseCase struct {
	deps       keys.Deps
	activation createcheckoutsession.Activation
}

func NewUseCase(deps keys.Deps, activation createcheckoutsession.Activation) *UseCase {
	return &UseCase{deps: deps, activation: activation}
}

// Execute lists the sessions the query names.
func (u *UseCase) Execute(ctx context.Context, query Query) (pagination.Page[checkout.CheckoutSessionAdmin], error) {
	empty := pagination.Page[checkout.CheckoutSessionAdmin]{}
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return empty, err
	}
	page, err := pagination.ParseKeyset(query.Cursor, query.Limit, "CheckoutSessions")
	if err != nil {
		return empty, err
	}
	statuses := query.Statuses
	if statuses == nil {
		statuses = []string{}
	}
	q := u.deps.Queries(ctx)
	ids, err := q.ListCheckoutSessionIDs(ctx, db.ListCheckoutSessionIDsParams{
		OrganizationID: user.OrganizationID, Statuses: statuses, Email: query.Email, ClientReferenceID: query.ClientReferenceID,
		CursorAt: page.CursorAt, CursorID: page.CursorID, RowLimit: page.RowLimit,
	})
	if err != nil {
		return empty, err
	}
	out := make([]checkout.CheckoutSessionAdmin, 0, len(ids))
	for _, id := range ids {
		row, err := q.GetCheckoutSession(ctx, db.GetCheckoutSessionParams{OrganizationID: user.OrganizationID, ID: id.ID})
		if err != nil {
			return empty, err
		}
		admin, err := getcheckoutsession.Admin(ctx, u.activation, row)
		if err != nil {
			return empty, err
		}
		out = append(out, *admin)
	}
	return pagination.KeysetPage(out, page, func(s checkout.CheckoutSessionAdmin) (time.Time, uuid.UUID) { return s.CreatedAt, s.SessionID })
}
