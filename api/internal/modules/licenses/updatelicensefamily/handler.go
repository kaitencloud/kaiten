package updatelicensefamily

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familyview"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "UpdateLicenseFamily"

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
	// Gate: listing a family in the public catalogue is a billing route (G,
	// §13.3), as the catalogue it feeds is.
	Gate gate.Gate
}

type UseCase struct {
	deps Deps
}

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }

// Command is the family's settings to change (§13.3). A nil member keeps the
// stored value; FallbackLicenseFamilySlug "" removes the fallback.
type Command struct {
	IsPublic                     *bool
	FallbackLicenseFamilySlug    *string
	TrialEndWithoutPaymentMethod *string
	TrialReminderDays            *int32
}

// Execute changes a family's own settings: whether the public catalogue lists
// it, the FREE family its instances fall back to when a subscription ends
// (V31-66), what a trial without a payment method becomes at its end (V31-65)
// and how many days before a trial's end trial_will_end fires (V32-07). It
// records no event: what a family serves does not change, which is what
// LICENSE_FAMILY_UPDATED announces.
func (u *UseCase) Execute(ctx context.Context, familySlug string, cmd Command) (*schema.LicenseFamilyView, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	ctx = u.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	if err := u.deps.Gate.Require(ctx, user.OrganizationID); err != nil {
		return nil, err
	}
	if b := cmd.TrialEndWithoutPaymentMethod; b != nil && *b != schema.TrialEndCancel && *b != schema.TrialEndConvert {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidTrialEndBehavior", "trialEndWithoutPaymentMethod is CANCEL or CONVERT")
	}
	if d := cmd.TrialReminderDays; d != nil && (*d < schema.MinTrialReminderDays || *d > schema.MaxTrialReminderDays) {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidTrialReminderDays", "trialReminderDays is between 1 and 30")
	}
	var view *schema.LicenseFamilyView
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(u.deps.Uof.DBTX(ctx))
		family, err := q.GetLicenseFamilyForUpdate(ctx, db.GetLicenseFamilyForUpdateParams{OrganizationID: user.OrganizationID, Slug: familySlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf(operation+".NotFound", "license family %q not found", familySlug)
		}
		if err != nil {
			return err
		}
		if !u.deps.AIPolicy.Enabled(ctx) && (cmd.IsPublic != nil || cmd.FallbackLicenseFamilySlug != nil || cmd.TrialEndWithoutPaymentMethod != nil || cmd.TrialReminderDays != nil) {
			hasAI, err := q.LicenseFamilyHasAI(ctx, db.LicenseFamilyHasAIParams{OrganizationID: user.OrganizationID, FamilyID: &family.ID, FamilySlug: nil})
			if err != nil {
				return err
			}
			if hasAI {
				return u.deps.AIPolicy.RequireEnabled(ctx)
			}
		}
		params := db.UpdateLicenseFamilySettingsParams{
			IsPublic: cmd.IsPublic, SetFallback: cmd.FallbackLicenseFamilySlug != nil, FallbackID: nil,
			TrialEndWithoutPaymentMethod: nil, TrialReminderDays: cmd.TrialReminderDays,
			OrganizationID: user.OrganizationID, Slug: familySlug,
		}
		if b := cmd.TrialEndWithoutPaymentMethod; b != nil {
			behavior := db.TrialEndWithoutPaymentMethod(*b)
			params.TrialEndWithoutPaymentMethod = &behavior
		}
		if slug := cmd.FallbackLicenseFamilySlug; slug != nil && *slug != "" {
			// The same answer for the family itself, a paid family and none
			// of this organization's: the code is no existence oracle.
			fallback, err := q.GetFreeFallbackFamily(ctx, db.GetFreeFallbackFamilyParams{
				OrganizationID: user.OrganizationID, Slug: *slug, FamilyID: family.ID,
			})
			if errors.Is(err, pgx.ErrNoRows) {
				return kaitenerrors.UnprocessableEntity(operation+".InvalidFallback",
					"fallbackLicenseFamilySlug names another FREE family of the organization: every version of it priced FREE")
			}
			if err != nil {
				return err
			}
			if !u.deps.AIPolicy.Enabled(ctx) {
				hasAI, err := q.LicenseFamilyHasAI(ctx, db.LicenseFamilyHasAIParams{OrganizationID: user.OrganizationID, FamilyID: &fallback, FamilySlug: nil})
				if err != nil {
					return err
				}
				if hasAI {
					return u.deps.AIPolicy.RequireEnabled(ctx)
				}
			}
			params.FallbackID = &fallback
		}
		if _, err := q.UpdateLicenseFamilySettings(ctx, params); err != nil {
			return err
		}
		view, _, err = familyview.NewReader(q).Get(ctx, user.OrganizationID, familySlug, familyview.Options{Version: nil, IncludeVersions: false})
		return err
	})
	if err != nil {
		return nil, err
	}
	return view, nil
}
