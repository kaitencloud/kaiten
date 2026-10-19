package createconversionrule

import (
	"context"
	"errors"

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
	Command = conversionrules.CreateConversionRule
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

func (h *UseCase) Execute(ctx context.Context, slug string, cmd *Command) (*schema.ConversionRule, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	params, err := conversionrules.Prepare(cmd.Pricing, "CreateConversionRule")
	if err != nil {
		return nil, err
	}
	if err := conversionrules.ValidateRequestType(cmd.RequestType, "CreateConversionRule"); err != nil {
		return nil, err
	}
	var created *schema.ConversionRule
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(h.deps.Uof.DBTX(ctx))
		if cmd.ModelSlug != nil {
			if err := q.LockConversionRuleModelCatalogue(ctx, user.OrganizationID); err != nil {
				return err
			}
		}
		license, err := conversionrules.LicenseID(ctx, q, user.OrganizationID, slug, "CreateConversionRule")
		if err != nil {
			return err
		}
		entitlement, err := q.ConversionRuleEntitlement(ctx, db.ConversionRuleEntitlementParams{OrganizationID: user.OrganizationID, Slug: cmd.EntitlementSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return apierrors.NotFound("CreateConversionRule.EntitlementNotFound", "entitlement not found")
		}
		if err != nil {
			return err
		}
		if entitlement.Type != db.EntitlementTypeNUMBERAICREDIT || entitlement.AggregationMethod == nil || *entitlement.AggregationMethod != db.AggregationMethodSUM {
			return apierrors.UnprocessableEntity("CreateConversionRule.EntitlementNotAiCreditPool", "entitlement must be a SUM AI credit pool")
		}
		if cmd.ModelSlug != nil {
			model, err := q.ConversionRuleModel(ctx, db.ConversionRuleModelParams{OrganizationID: user.OrganizationID, Slug: *cmd.ModelSlug})
			if errors.Is(err, pgx.ErrNoRows) {
				return apierrors.NotFound("CreateConversionRule.ModelNotFound", "model not found")
			}
			if err != nil {
				return err
			}
			switch model.Status {
			case db.ModelStatusDEPRECATED:
				return apierrors.UnprocessableEntity("CreateConversionRule.ModelDeprecated", "deprecated models take no new rules")
			case db.ModelStatusARCHIVED:
				return apierrors.UnprocessableEntity("CreateConversionRule.ModelArchived", "archived models take no new rules")
			}
			params.ModelID = &model.ID
		}
		if cmd.RequestType != nil {
			v := db.AiRequestType(*cmd.RequestType)
			params.RequestType = &v
		}
		params.OrganizationID = user.OrganizationID
		params.UserID = user.ID
		params.LicenseID = license
		params.EntitlementID = entitlement.ID
		id, err := q.CreateConversionRule(ctx, params)
		if err != nil {
			return conversionrules.WriteError(err, "CreateConversionRule")
		}
		created, err = conversionrules.Get(ctx, q, user.OrganizationID, license, id, "CreateConversionRule")
		if err != nil {
			return err
		}
		return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID, events.LicenseConversionRuleCreated.Name, events.LicenseConversionRuleCreated.Type, created, nil))
	})
	return created, err
}
