package updateconversionrule

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/conversionrules"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type (
	Command = conversionrules.UpdateConversionRuleBody
	Deps    struct {
		UserProvider currentuser.Provider
		Uof          *uow.UnitOfWork
	}
)

type UseCase struct {
	deps   Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

func (h *UseCase) Execute(ctx context.Context, slug string, id uuid.UUID, cmd *Command) (*schema.ConversionRule, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	var updated *schema.ConversionRule
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(h.deps.Uof.DBTX(ctx))
		license, err := conversionrules.LicenseID(ctx, q, user.OrganizationID, slug, "UpdateConversionRule")
		if err != nil {
			return err
		}
		_, err = q.LockConversionRule(ctx, db.LockConversionRuleParams{OrganizationID: user.OrganizationID, LicenseID: license, RuleID: id})
		if errors.Is(err, pgx.ErrNoRows) {
			return apierrors.NotFound("UpdateConversionRule.NotFound", "conversion rule not found")
		}
		if err != nil {
			return err
		}
		before, err := conversionrules.Get(ctx, q, user.OrganizationID, license, id, "UpdateConversionRule")
		if err != nil {
			return err
		}
		if before.Status == schema.ConversionRuleArchived {
			return apierrors.Conflict("UpdateConversionRule.Archived", "archived rules cannot be updated")
		}
		if err := conversionrules.CheckIdentity(cmd, before); err != nil {
			return err
		}
		p, err := conversionrules.Prepare(cmd.Pricing, "UpdateConversionRule")
		if err != nil {
			return err
		}
		rows, err := q.UpdateConversionRule(ctx, db.UpdateConversionRuleParams{
			OrganizationID: user.OrganizationID, UserID: user.ID, LicenseID: license, RuleID: id,
			RatePerRequest: p.RatePerRequest, RatePerInputToken: p.RatePerInputToken, RatePerCachedInputToken: p.RatePerCachedInputToken, RatePerCacheWriteToken: p.RatePerCacheWriteToken, RatePerOutputToken: p.RatePerOutputToken, RatePerUnit: p.RatePerUnit, RatePerSecond: p.RatePerSecond, MinimumCreditsPerRequest: p.MinimumCreditsPerRequest, MaximumCreditsPerRequest: p.MaximumCreditsPerRequest, ChargeOnError: p.ChargeOnError,
		})
		if err := conversionrules.RequireWrite(rows, err, "UpdateConversionRule"); err != nil {
			return err
		}
		updated, err = conversionrules.Get(ctx, q, user.OrganizationID, license, id, "UpdateConversionRule")
		if err != nil {
			return err
		}
		return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID, events.LicenseConversionRuleUpdated.Name, events.LicenseConversionRuleUpdated.Type, schema.ConversionRuleUpdated{Before: before, After: updated}, nil))
	})
	return updated, err
}
