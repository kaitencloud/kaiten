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
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "UpdateLicenseFamily"

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
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

// Execute lists a family in the public catalogue, or takes it out. It
// records no event: what a family serves does not change, which is what
// LICENSE_FAMILY_UPDATED announces.
func (u *UseCase) Execute(ctx context.Context, familySlug string, isPublic bool) (*schema.LicenseFamilyView, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	if err := u.deps.Gate.Require(ctx, user.OrganizationID); err != nil {
		return nil, err
	}
	var view *schema.LicenseFamilyView
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(u.deps.Uof.DBTX(ctx))
		_, err := q.SetLicenseFamilyPublic(ctx, db.SetLicenseFamilyPublicParams{
			IsPublic: isPublic, OrganizationID: user.OrganizationID, Slug: familySlug,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf(operation+".NotFound", "license family %q not found", familySlug)
		}
		if err != nil {
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
