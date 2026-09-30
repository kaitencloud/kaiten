package upsertintegration

import (
	"context"

	"github.com/google/uuid"

	createcustomer "github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	updatecustomer "github.com/kaitencloud/kaiten/api/internal/modules/customers/updatecustomer"
	createinstance "github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	updateinstance "github.com/kaitencloud/kaiten/api/internal/modules/instances/updateinstance"
)

// CustomerCreator, CustomerUpdater, InstanceCreator, and InstanceUpdater are
// each the owning module's own public use case, narrowed to exactly what
// this package composes into its own transaction (see uow.Transact's doc
// comment). *createcustomer.UseCase, *updatecustomer.UseCase,
// *createinstance.UseCase, and *updateinstance.UseCase satisfy these
// structurally -- naming their concrete Command/schema types is what makes
// that possible without either side importing the other, since Go requires
// exact type identity in interface method signatures.
type CustomerCreator interface {
	EnforceCreationLimit(ctx context.Context, orgID uuid.UUID, slug, name string) error
	Execute(ctx context.Context, command *createcustomer.Command) (*customerschema.Customer, error)
}

type CustomerUpdater interface {
	Execute(ctx context.Context, command *updatecustomer.Command, slug string) (*customerschema.Customer, error)
}

type InstanceCreator interface {
	EnforceCreationLimit(ctx context.Context, orgID uuid.UUID) error
	Execute(ctx context.Context, command *createinstance.Command) (*instanceschema.Instance, error)
}

type InstanceUpdater interface {
	Execute(ctx context.Context, command *updateinstance.Command, slug string) (*instanceschema.Instance, error)
}
