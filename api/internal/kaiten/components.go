package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/components"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/createcomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/deletecomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/getcomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/getcomponents"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/updatecomponent"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Components is the components module's five operations. See Customers for the
// naming and argument-order convention every core namespace follows.
type Components struct {
	uc *components.UseCases
}

// Components returns the components surface.
func (k *Kaiten) Components() Components {
	return Components{uc: k.modules.Components}
}

func (c Components) Create(
	ctx context.Context, cl caller.OrganizationCaller, cmd *createcomponent.Command,
) (*componentschema.Component, error) {
	if err := cl.Require(createcomponent.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.CreateComponent.Execute(bindOrganization(ctx, cl), cmd)
}

func (c Components) List(
	ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
) (pagination.Page[*componentschema.Component], error) {
	if err := cl.Require(getcomponents.RequiredScope); err != nil {
		return pagination.Page[*componentschema.Component]{}, err
	}

	return c.uc.GetComponents.Execute(bindOrganization(ctx, cl), limit, cursor)
}

func (c Components) Get(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*componentschema.Component, error) {
	if err := cl.Require(getcomponent.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.GetComponent.Execute(bindOrganization(ctx, cl), slug)
}

// Update updates a component in place, or versions it when it is already linked to
// a release. Which of the two happens is the use case's decision, not the caller's.
func (c Components) Update(
	ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *updatecomponent.Command,
) (*componentschema.Component, error) {
	if err := cl.Require(updatecomponent.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.UpdateComponent.Execute(bindOrganization(ctx, cl), slug, cmd)
}

func (c Components) Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error {
	if err := cl.Require(deletecomponent.RequiredScope); err != nil {
		return err
	}

	return c.uc.DeleteComponent.Execute(bindOrganization(ctx, cl), slug)
}
