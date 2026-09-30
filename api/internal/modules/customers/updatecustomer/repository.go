package updatecustomer

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type CommandRepository struct {
	uof *uow.UnitOfWork
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves the sqlc Queries bound to whatever DBTX is active for
// ctx -- the caller's transaction if Transact opened one, the pool
// otherwise.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

func (r *CommandRepository) UpdateCustomer(ctx context.Context, command *Command, slug string, userID uuid.UUID, organizationID uuid.UUID) (*schema.Customer, error) {
	sqlcParams := db.UpdateCustomerParams{
		Slug:               slug,
		OrganizationID:     organizationID,
		ExternalCustomerID: command.ExternalCustomerID,
		Domain:             command.Domain,
		Name:               command.Name,
		UserID:             userID,
	}

	c, err := r.q(ctx).UpdateCustomer(ctx, sqlcParams)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("UpdateCustomer.NotFound", fmt.Sprintf("Customer with slug %q not found", slug))
		}
		return nil, err
	}

	return &schema.Customer{
		ID:                 c.ID,
		Name:               c.Name,
		Slug:               c.Slug,
		ExternalCustomerID: c.ExternalCustomerID,
		Domain:             c.Domain,
		CreatedBy:          shared.User{ID: c.CreatedByID, Name: c.CreatedByName},
		UpdatedBy:          shared.User{ID: c.UpdatedByID, Name: c.UpdatedByName},
		CreatedAt:          c.CreatedAt.Time,
		UpdatedAt:          c.UpdatedAt.Time,
	}, nil
}
