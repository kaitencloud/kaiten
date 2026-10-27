package kaiten

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/models"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/createmodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/deletemodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/getaiusagecapabilities"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/getmodel"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/listmodels"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/updatemodel"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Models is the organization-scoped model catalogue.
type Models struct{ uc *models.UseCases }

func (k *Kaiten) Models() Models { return Models{uc: k.modules.Models} }

func (m Models) Create(ctx context.Context, cl caller.OrganizationCaller, cmd *createmodel.Command) (*schema.Model, error) {
	if err := cl.Require(createmodel.RequiredScope); err != nil {
		return nil, err
	}
	return m.uc.CreateModel.Execute(bindOrganization(ctx, cl), cmd)
}

func (m Models) Get(ctx context.Context, cl caller.OrganizationCaller, slug string) (*schema.Model, error) {
	if err := cl.Require(getmodel.RequiredScope); err != nil {
		return nil, err
	}
	return m.uc.GetModel.Execute(bindOrganization(ctx, cl), slug)
}

func (m Models) List(ctx context.Context, cl caller.OrganizationCaller, filter listmodels.Filter, limit int32, cursor *string) (pagination.Page[*schema.Model], error) {
	if err := cl.Require(listmodels.RequiredScope); err != nil {
		return pagination.Page[*schema.Model]{}, err
	}
	return m.uc.ListModels.Execute(bindOrganization(ctx, cl), filter, limit, cursor)
}

func (m Models) Update(ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *updatemodel.Command) (*schema.Model, error) {
	if err := cl.Require(updatemodel.RequiredScope); err != nil {
		return nil, err
	}
	return m.uc.UpdateModel.Execute(bindOrganization(ctx, cl), slug, cmd)
}

func (m Models) Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error {
	if err := cl.Require(deletemodel.RequiredScope); err != nil {
		return err
	}
	return m.uc.DeleteModel.Execute(bindOrganization(ctx, cl), slug)
}

// Capabilities is the one auth-only deployment read on this namespace. A zero
// caller is denied even though readiness requires no product permission.
func (m Models) Capabilities(_ context.Context, cl caller.OrganizationCaller) (getaiusagecapabilities.Capabilities, error) {
	if cl.UserID() == uuid.Nil || cl.OrganizationID() == uuid.Nil {
		return getaiusagecapabilities.Capabilities{}, apierrors.Unauthorized("Auth.NoIdentity", "no identity found in context")
	}
	return m.uc.Capabilities.Read(), nil
}
