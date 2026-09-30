package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/releases"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/createrelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/deleterelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/getrelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/getreleases"
	releaseschema "github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Releases is the releases module's four operations. There is no Update, and that
// is the domain rule rather than an omission: a release is immutable once created,
// so changing one means Delete plus Create -- which starts a new deployment
// history.
//
// See Customers for the naming and argument-order convention.
type Releases struct {
	uc *releases.UseCases
}

// Releases returns the releases surface.
func (k *Kaiten) Releases() Releases {
	return Releases{uc: k.modules.Releases}
}

func (r Releases) Create(
	ctx context.Context, cl caller.OrganizationCaller, cmd *createrelease.Command,
) (*releaseschema.Release, error) {
	if err := cl.Require(createrelease.RequiredScope); err != nil {
		return nil, err
	}

	return r.uc.CreateRelease.Execute(bindOrganization(ctx, cl), cmd)
}

func (r Releases) List(
	ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
) (pagination.Page[*releaseschema.Release], error) {
	if err := cl.Require(getreleases.RequiredScope); err != nil {
		return pagination.Page[*releaseschema.Release]{}, err
	}

	return r.uc.GetReleases.Execute(bindOrganization(ctx, cl), limit, cursor)
}

func (r Releases) Get(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*releaseschema.Release, error) {
	if err := cl.Require(getrelease.RequiredScope); err != nil {
		return nil, err
	}

	return r.uc.GetRelease.Execute(bindOrganization(ctx, cl), slug)
}

func (r Releases) Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error {
	if err := cl.Require(deleterelease.RequiredScope); err != nil {
		return err
	}

	return r.uc.DeleteRelease.Execute(bindOrganization(ctx, cl), slug)
}
