package deleteinstance

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
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

func (r *CommandRepository) DeleteInstance(ctx context.Context, userID uuid.UUID, organizationID uuid.UUID, slug string) (*schema.Instance, error) {
	if err := r.refuseBilled(ctx, organizationID, slug); err != nil {
		return nil, err
	}

	params := db.DeleteInstanceParams{
		Slug:           slug,
		UserID:         userID,
		OrganizationID: organizationID,
	}

	i, err := r.q(ctx).DeleteInstance(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteInstance.NotFound", fmt.Sprintf("Instance with slug %q not found", slug))
		}
		return nil, err
	}

	licenseSlug := ""
	if i.LicenseSlug != nil {
		licenseSlug = *i.LicenseSlug
	}

	return &schema.Instance{
		ID:                 i.ID,
		Name:               i.Name,
		Slug:               i.Slug,
		Description:        i.Description,
		CreatedBy:          shared.User{ID: i.CreatedByID, Name: i.CreatedByName},
		CreatedAt:          i.CreatedAt.Time,
		UpdatedBy:          shared.User{ID: i.UpdatedByID, Name: i.UpdatedByName},
		UpdatedAt:          i.UpdatedAt.Time,
		Status:             schema.InstanceStatus(i.Status),
		LifecycleStage:     i.LifecycleStage,
		CustomerID:         i.CustomerID,
		LicenseID:          i.LicenseID,
		LicenseSlug:        licenseSlug,
		DeploymentZoneID:   i.DeploymentZoneID,
		DeploymentZoneSlug: i.DeploymentZoneSlug,
		StartLicenseDate:   i.StartLicenseDate.Time,
		EndLicenseDate:     i.EndLicenseDate.Time,
	}, nil
}

// refuseBilled refuses to delete an instance that bills: a live subscription,
// or an invoice not settled yet. Once both are behind it, the instance goes
// and its subscription and invoices stay, readable through their snapshots.
// The instance is locked first, so a subscribe cannot slip in between.
func (r *CommandRepository) refuseBilled(ctx context.Context, organizationID uuid.UUID, slug string) error {
	q := r.q(ctx)
	if _, err := q.LockInstanceForDelete(ctx, db.LockInstanceForDeleteParams{OrganizationID: organizationID, Slug: slug}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	block, err := q.GetInstanceBillingBlock(ctx, db.GetInstanceBillingBlockParams{OrganizationID: organizationID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	live := block.Status == "TRIAL" || block.Status == "ACTIVE" || block.Status == "PAST_DUE"
	if !live && len(block.UnpaidInvoiceIds) == 0 {
		return nil
	}
	return kaitenerrors.ConflictWithErrors("DeleteInstance.BillingActive",
		fmt.Sprintf("Instance %q is billed: cancel its subscription and settle its invoices first", slug),
		&kaitenerrors.ErrorDetail{
			Message:  "the subscription's status and the invoices not settled yet",
			Location: "instance",
			Value:    map[string]any{"status": block.Status, "unpaidInvoiceIds": block.UnpaidInvoiceIds},
		})
}
