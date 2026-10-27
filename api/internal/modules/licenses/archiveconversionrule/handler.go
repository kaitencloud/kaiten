package archiveconversionrule

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
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
}
type UseCase struct {
	deps   Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

func (h *UseCase) Execute(ctx context.Context, slug string, id uuid.UUID) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}
	ctx = h.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	if err := h.deps.AIPolicy.RequireEnabled(ctx); err != nil {
		return err
	}
	return h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(h.deps.Uof.DBTX(ctx))
		member, err := q.ConversionRuleActorIsMember(ctx, db.ConversionRuleActorIsMemberParams{OrganizationID: user.OrganizationID, UserID: user.ID})
		if err != nil {
			return err
		}
		if !member {
			return apierrors.Forbidden("CurrentUser.NotInOrganization", "actor is not an active organization member")
		}

		license, err := conversionrules.LicenseID(ctx, q, user.OrganizationID, slug, "ArchiveConversionRule")
		if err != nil {
			return err
		}
		_, err = q.LockConversionRule(ctx, db.LockConversionRuleParams{OrganizationID: user.OrganizationID, LicenseID: license, RuleID: id})
		if errors.Is(err, pgx.ErrNoRows) {
			return apierrors.NotFound("ArchiveConversionRule.NotFound", "conversion rule not found")
		}
		if err != nil {
			return err
		}
		before, err := conversionrules.Get(ctx, q, user.OrganizationID, license, id, "ArchiveConversionRule")
		if err != nil {
			return err
		}
		if before.Status == schema.ConversionRuleArchived {
			return nil
		}
		rows, err := q.ArchiveConversionRule(ctx, db.ArchiveConversionRuleParams{OrganizationID: user.OrganizationID, UserID: user.ID, LicenseID: license, RuleID: id})
		if err := conversionrules.RequireWrite(rows, err, "ArchiveConversionRule"); err != nil {
			return err
		}
		archived, err := conversionrules.Get(ctx, q, user.OrganizationID, license, id, "ArchiveConversionRule")
		if err != nil {
			return err
		}
		return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID, events.LicenseConversionRuleArchived.Name, events.LicenseConversionRuleArchived.Type, archived, nil))
	})
}
