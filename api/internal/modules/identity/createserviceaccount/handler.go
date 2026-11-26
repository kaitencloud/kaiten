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

// EntitlementLimitReachedCode is the error code a create answers with when the
// organization already holds every service account its licence allows.
const EntitlementLimitReachedCode = "CreateServiceAccount.EntitlementLimitReached"

// Deps lists exactly what this handler needs, instead of the full
// services.Container. Membership is the organization module's own public
// port (see addmembership) -- this module never imports organization's
// generated db package directly.
type Deps struct {
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
	Membership   *addmembership.UseCase
	// StockReporter sets the service-accounts entitlement to the number the
	// organization will hold. Nil sets nothing (self-hosted, unit tests).
	StockReporter services.StockReporter
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

// Execute creates a service account in the caller's organization.
//
// On a deployment licensed by a licensing authority, the service-accounts
// entitlement is set first to the number the organization will hold, and the
// create is refused with a 409 when that is beyond the licence (a 503 when the
// limit cannot be verified). Set rather than incremented: the count read here is
// the truth, so accounts created before the entitlement existed are counted, and
// an organization already above its allowance is refused. A delete
// (deleteserviceaccount) sets it back to the number still held.
//
// A caller-supplied slug is validated before the counter is touched, so an
// invalid one answers 422 without a round trip to the licensing authority.
// Creates of one organization are serialized from their insert on: a create
// that finds, once inserted, more accounts than the count it was allowed is
// checked again at that count, so two creates racing for the last place cannot
// both keep it.
func (h *UseCase) Execute(ctx context.Context, name string, slug *string) (*schema.ServiceAccount, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	if slug != nil {
		resolved, err := slugutil.New(*slug)
		if err != nil {
			return nil, kaitenerrors.Validation("CreateServiceAccount.InvalidSlug", slugutil.InvalidReason(*slug))
		}
		normalized := resolved.String()
		slug = &normalized
	}

	held, err := h.repo.CountServiceAccounts(ctx, user.OrganizationID)
	if err != nil {
		return nil, fmt.Errorf("failed to count service accounts: %w", err)
	}
	if err := dogfooding.EnforceStockLimit(ctx, h.deps.StockReporter, user.OrganizationID,
		dogfooding.ServiceAccountEntitlementSlug, held+1,
		EntitlementLimitReachedCode, "Service account limit reached for this organization",
	); err != nil {
		return nil, err
	}

	created, err := h.create(ctx, user, name, slug, held+1)
	if err != nil {
		// The counter was set for an account that does not exist: set it to what
		// the organization holds now, which a concurrent create may have changed.
		if now, countErr := h.repo.CountServiceAccounts(ctx, user.OrganizationID); countErr == nil {
			dogfooding.SyncStock(ctx, h.deps.StockReporter, user.OrganizationID,
				dogfooding.ServiceAccountEntitlementSlug, now)
		}
		return nil, err
	}
	return created, nil
}

// create inserts the account. allowed is the count the licensing authority
// accepted for this create; an insert that brings the organization past it,
// because another create committed in between, is checked again at the count it
// actually reaches, and rolled back if that is refused.
func (h *UseCase) create(ctx context.Context, user *currentuser.User, name string, slug *string, allowed int64) (*schema.ServiceAccount, error) {
	externalID, err := random.GeneratePrefixed("ksa_", IDSize)
	if err != nil {
		return nil, fmt.Errorf("failed to generate service account ID: %w", err)
	}

	attempt := func(resolvedSlug string) (*schema.ServiceAccount, error) {
		var result *db.CreateServiceAccountRow

		err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
			if err := h.repo.LockServiceAccounts(ctx, user.OrganizationID); err != nil {
				return fmt.Errorf("failed to lock the organization's service accounts: %w", err)
			}

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

			// Another create committed between the count and this insert: check the
			// count actually reached. Rare, so the round trip to the licensing
			// authority inside the transaction is too.
			reached, err := h.repo.CountServiceAccounts(ctx, user.OrganizationID)
			if err != nil {
				return fmt.Errorf("failed to count service accounts: %w", err)
			}
			if reached > allowed {
				if err := dogfooding.EnforceStockLimit(ctx, h.deps.StockReporter, user.OrganizationID,
					dogfooding.ServiceAccountEntitlementSlug, reached,
					EntitlementLimitReachedCode, "Service account limit reached for this organization",
				); err != nil {
					return err
				}
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

	if slug != nil {
		// Validated and normalized by Execute, before the counter was set.
		return attempt(*slug)
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
}
