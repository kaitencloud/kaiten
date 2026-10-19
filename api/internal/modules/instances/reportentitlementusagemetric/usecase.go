package reportentitlementusagemetric

import (
	"context"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	IdempotencyWindow time.Duration
	ReservationTTL    time.Duration
	ReservationMaxTTL time.Duration
	UserProvider      currentuser.Provider
	UsageReporter     services.UsageReporter
	Uof               *uow.UnitOfWork
}

type UseCase struct {
	deps        Deps
	queryRepo   *QueryRepository
	commandRepo *CommandRepository
	outbox      *outbox.ScopedRepository
}

func NewUseCase(deps Deps) *UseCase {
	if deps.IdempotencyWindow == 0 {
		deps.IdempotencyWindow = DefaultIdempotencyWindow
	}
	if deps.ReservationTTL == 0 {
		deps.ReservationTTL = DefaultReservationTTL
	}
	if deps.ReservationMaxTTL == 0 {
		deps.ReservationMaxTTL = DefaultReservationMaxTTL
	}
	return &UseCase{
		deps:        deps,
		queryRepo:   NewQueryRepository(deps.Uof),
		commandRepo: NewCommandRepository(deps.Uof),
		outbox:      outbox.NewScopedRepository(deps.Uof),
	}
}

// Execute runs one report in one transaction: load the pair's state under
// its lock, let the report's kind plan it, apply the plan. Every report,
// whatever its kind, goes through exactly one lock, one clock read, one
// rollover and one counter upsert.
func (h *UseCase) Execute(ctx context.Context, instanceSlug, entitlementSlug string, command *Command) (response *schema.EntitlementUsage, resultErr error) {
	defer func() { recordAIReport(ctx, command, response, resultErr) }()
	if command.AI != nil {
		if err := validateAI(command, h.deps.ReservationMaxTTL); err != nil {
			return nil, err
		}
	}
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	if command.AI == nil || command.AI.Phase == "commit" {
		h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.EntitlementValuesReportedEntitlementSlug)
	}

	var effect *Effect
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		st, err := h.load(ctx, user.OrganizationID, instanceSlug, entitlementSlug)
		if err != nil {
			return err
		}
		if err := h.loadAI(ctx, st, command); err != nil {
			return err
		}
		if st.Replay != nil {
			effect = &Effect{Response: st.Replay, Replayed: true}
			return nil
		}
		effect, err = kindFor(command).plan(st, command)
		if err != nil {
			return err
		}
		return h.apply(ctx, st, effect)
	})
	if err != nil {
		return nil, err
	}

	if effect.Refusal != nil {
		return nil, effect.Refusal
	}
	return effect.Response, nil
}
