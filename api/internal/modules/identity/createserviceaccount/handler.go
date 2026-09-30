package createserviceaccount

import (
	"context"
	"errors"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/addmembership"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/random"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const IDSize = 32

// Deps lists exactly what this handler needs, instead of the full
// services.Container. Membership is the organization module's own public
// port (see addmembership) -- this module never imports organization's
// generated db package directly.
type Deps struct {
	UserProvider  currentuser.Provider
	UsageReporter services.UsageReporter
	Uof           *uow.UnitOfWork
	Membership    *addmembership.UseCase
}

type UseCase struct {
	deps Deps
	repo *CommandRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps: deps,
		repo: NewCommandRepository(deps.Uof),
	}
}

func (h *UseCase) Execute(ctx context.Context, name string, slug *string) (*schema.ServiceAccount, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	externalID, err := random.GeneratePrefixed("ksa_", IDSize)
	if err != nil {
		return nil, fmt.Errorf("failed to generate service account ID: %w", err)
	}

	attempt := func(resolvedSlug string) (*schema.ServiceAccount, error) {
		var result *db.CreateServiceAccountRow

		err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
			serviceAccount, err := h.repo.CreateServiceAccount(
				ctx,
				name,
				resolvedSlug,
				user.ID,
				externalID,
				user.OrganizationID,
			)
			if err != nil {
				var kaitenErr *kaitenerrors.Error
				if errors.As(err, &kaitenErr) {
					return err
				}
				return fmt.Errorf("failed to create service account: %w", err)
			}

			// Joins this same transaction: see uow.UnitOfWork.Transact's doc
			// comment on composing another module's public Execute.
			err = h.deps.Membership.Execute(ctx, serviceAccount.ID, user.OrganizationID)
			if err != nil {
				return fmt.Errorf("failed to link service account to organization: %w", err)
			}

			result = serviceAccount
			return nil
		})
		if err != nil {
			return nil, err
		}

		return &schema.ServiceAccount{
			ID:         result.ID,
			Name:       result.Name,
			Slug:       resolvedSlug,
			ExternalID: result.ExternalID,
			CreatedBy:  shared.NewUser(result.CreatedByID, result.CreatedByName),
			CreatedAt:  *pgtime.PgTimeStampToTimePtr(result.CreatedAt),
		}, nil
	}

	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, user.OrganizationID, dogfooding.ServiceAccountEntitlementSlug,
		"CreateServiceAccount.ServiceAccountLimitReached", "Service account creation limit reached for this organization", nil,
		func(_ context.Context) (*schema.ServiceAccount, error) {
			if slug != nil {
				resolvedSlug, err := slugutil.New(*slug)
				if err != nil {
					return nil, kaitenerrors.Validation("CreateServiceAccount.InvalidSlug", slugutil.InvalidReason(*slug))
				}
				return attempt(resolvedSlug.String())
			}

			// No caller-supplied slug: derive one from the name. GenerateUnique's
			// random suffix makes a database-level collision astronomically
			// unlikely but, per its own doc comment, not impossible -- so a rare
			// conflict is retried with a freshly generated slug rather than
			// surfaced as a hard failure for something outside the caller's
			// control.
			return slugutil.Retry(
				slugutil.DefaultMaxAttempts,
				func() (string, error) { return slugutil.GenerateUnique(name) },
				attempt,
			)
		})
}
