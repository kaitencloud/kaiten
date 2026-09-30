package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/customers"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/deletecustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/deleteintegrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomers"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getintegrations"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/updatecustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/updateintegrations"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Customers is the customers module's nine operations.
//
// The naming convention every core namespace follows: the method drops the noun
// the namespace already carries, so it reads Customers().Create rather than
// Customers().CreateCustomer. The four integration operations keep theirs --
// CreateIntegration -- because they act on a customer's integration record rather
// than on the customer, and dropping it would make two different writes share a
// name.
//
// Argument order is (ctx, caller, identifiers..., payload) on every method here,
// including where the use case underneath takes them the other way round:
// updatecustomer.Execute is Execute(ctx, command, slug), and Update reorders
// explicitly rather than letting one slice's history set the shape of the facade.
type Customers struct {
	uc *customers.UseCases
}

// Customers returns the customers surface. A value, not a pointer, for the reason
// Platform is: one module pointer and no state of its own.
func (k *Kaiten) Customers() Customers {
	return Customers{uc: k.modules.Customers}
}

func (c Customers) Create(
	ctx context.Context, cl caller.OrganizationCaller, cmd *createcustomer.Command,
) (*customerschema.Customer, error) {
	if err := cl.Require(createcustomer.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.CreateCustomer.Execute(bindOrganization(ctx, cl), cmd)
}

func (c Customers) List(
	ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
) (pagination.Page[*customerschema.Customer], error) {
	if err := cl.Require(getcustomers.RequiredScope); err != nil {
		return pagination.Page[*customerschema.Customer]{}, err
	}

	return c.uc.GetCustomers.Execute(bindOrganization(ctx, cl), limit, cursor)
}

func (c Customers) Get(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*customerschema.Customer, error) {
	if err := cl.Require(getcustomer.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.GetCustomer.Execute(bindOrganization(ctx, cl), slug)
}

func (c Customers) Update(
	ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *updatecustomer.Command,
) (*customerschema.Customer, error) {
	if err := cl.Require(updatecustomer.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.UpdateCustomer.Execute(bindOrganization(ctx, cl), cmd, slug)
}

func (c Customers) Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error {
	if err := cl.Require(deletecustomer.RequiredScope); err != nil {
		return err
	}

	return c.uc.DeleteCustomer.Execute(bindOrganization(ctx, cl), slug)
}

func (c Customers) CreateIntegration(
	ctx context.Context, cl caller.OrganizationCaller,
	customerSlug, integrationName string, body customerschema.CustomerIntegration,
) (*customerschema.CustomerIntegration, error) {
	if err := cl.Require(createintegrations.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.CreateIntegration.Execute(bindOrganization(ctx, cl), customerSlug, integrationName, body)
}

func (c Customers) GetIntegration(
	ctx context.Context, cl caller.OrganizationCaller, customerSlug, integrationName string,
) (*customerschema.CustomerIntegration, error) {
	if err := cl.Require(getintegrations.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.GetIntegration.Execute(bindOrganization(ctx, cl), customerSlug, integrationName)
}

func (c Customers) UpdateIntegration(
	ctx context.Context, cl caller.OrganizationCaller,
	customerSlug, integrationName string, body customerschema.CustomerIntegration,
) (*customerschema.CustomerIntegration, error) {
	if err := cl.Require(updateintegrations.RequiredScope); err != nil {
		return nil, err
	}

	return c.uc.UpdateIntegration.Execute(bindOrganization(ctx, cl), customerSlug, integrationName, body)
}

func (c Customers) DeleteIntegration(
	ctx context.Context, cl caller.OrganizationCaller, customerSlug, integrationName string,
) error {
	if err := cl.Require(deleteintegrations.RequiredScope); err != nil {
		return err
	}

	return c.uc.DeleteIntegration.Execute(bindOrganization(ctx, cl), customerSlug, integrationName)
}
