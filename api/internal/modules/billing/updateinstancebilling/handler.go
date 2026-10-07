package updateinstancebilling

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "UpdateInstanceBilling"

// Command is a change of terms. A member that is not Set is left as it is; a
// Set member without a value goes back to the organization's default.
type Command struct {
	CollectionMethod Optional[string]
	DaysUntilDue     Optional[int32]
}

// Optional is a PATCH member: absent, null, or a value.
type Optional[T any] struct {
	Set   bool
	Value *T
}

type UseCase struct {
	deps access.Deps
}

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute changes the subscription's own terms, from its next invoice on;
// invoices already composed keep theirs. It records no event: the change is
// kept by the row's updated_by_id and updated_at.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, cmd Command) (*subscriptions.InstanceBilling, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if cmd.CollectionMethod.Value != nil && *cmd.CollectionMethod.Value != settings.SendInvoice {
		return nil, kaitenerrors.UnprocessableEntity(operation+".CollectionMethodUnsupported",
			"only SEND_INVOICE is available: automatic collection needs a payment provider")
	}
	if v := cmd.DaysUntilDue.Value; v != nil && (*v < 0 || *v > 365) {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidDaysUntilDue", "daysUntilDue is between 0 and 365")
	}
	var result *subscriptions.InstanceBilling
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		sub, err := lifecycle.Lock(ctx, q, user.OrganizationID, instanceSlug, operation)
		if err != nil {
			return err
		}
		if !subscriptions.Live(sub.Status) {
			return kaitenerrors.Conflict(operation+".NotActive", "the subscription is canceled")
		}
		now, err := lifecycle.Now(ctx, q)
		if err != nil {
			return err
		}
		if err := lifecycle.BoundaryPending(operation, sub, now); err != nil {
			return err
		}
		method, days := sub.CollectionMethod, sub.DaysUntilDue
		if cmd.CollectionMethod.Set {
			method = nil
			if cmd.CollectionMethod.Value != nil {
				m := db.CollectionMethod(*cmd.CollectionMethod.Value)
				method = &m
			}
		}
		if cmd.DaysUntilDue.Set {
			days = cmd.DaysUntilDue.Value
		}
		updated, err := q.UpdateSubscriptionTerms(ctx, db.UpdateSubscriptionTermsParams{
			CollectionMethod: method, DaysUntilDue: days, UserID: user.ID, Now: invoices.Timestamp(now), ID: sub.ID,
		})
		if err != nil {
			return err
		}
		result, err = subscriptions.Build(ctx, q, u.deps.Catalogue, updated)
		return err
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
