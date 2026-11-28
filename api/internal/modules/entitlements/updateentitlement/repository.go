package updateentitlement

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/combined"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/grouprefs"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/sourcerefs"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UpdateEntitlementInput struct {
	Name                    string
	Description             *string
	Type                    schema.Type
	Icon                    *string
	UnitSingular            *string
	UnitPlural              *string
	SaleUnitSingular        *string
	SaleUnitPlural          *string
	SaleUnitFactor          *float64
	UserFacing              bool
	DisplayOrder            int32
	WarningThresholdPercent int32
	ResetPeriod             *period.ResetPeriod
	ResetAnchor             *period.ResetAnchor
}

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

func (r *CommandRepository) GetEntitlement(ctx context.Context, slug string, organizationID uuid.UUID) (*schema.Entitlement, error) {
	queries := r.q(ctx)

	result, err := queries.GetEntitlement(ctx, db.GetEntitlementParams{
		Slug:           slug,
		OrganizationID: organizationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("UpdateEntitlement.NotFound", fmt.Sprintf("Entitlement with slug %q not found", slug))
		}
		return nil, err
	}

	entitlement := dbmap.ToEntitlement(&result)
	entitlement.EntitlementGroups, err = grouprefs.LoadForEntitlement(ctx, queries, slug, organizationID)
	if err != nil {
		return nil, err
	}
	if err := sourcerefs.Attach(ctx, queries, entitlement, organizationID); err != nil {
		return nil, err
	}

	return entitlement, nil
}

func (r *CommandRepository) UpdateEntitlement(ctx context.Context, input UpdateEntitlementInput, slug string, organizationID uuid.UUID) (*schema.Entitlement, error) {
	var dbResetPeriod *db.EntitlementResetPeriod
	if input.ResetPeriod != nil {
		rp := db.EntitlementResetPeriod(*input.ResetPeriod)
		if err := rp.Scan(string(*input.ResetPeriod)); err != nil {
			return nil, err
		}
		dbResetPeriod = &rp
	}
	var dbResetAnchor *db.EntitlementResetAnchor
	if input.ResetAnchor != nil {
		ra := db.EntitlementResetAnchor(*input.ResetAnchor)
		if err := ra.Scan(string(*input.ResetAnchor)); err != nil {
			return nil, err
		}
		dbResetAnchor = &ra
	}

	params := db.UpdateEntitlementParams{
		Name:             input.Name,
		Description:      input.Description,
		OrganizationID:   organizationID,
		Slug:             slug,
		Icon:             input.Icon,
		UnitSingular:     input.UnitSingular,
		UnitPlural:       input.UnitPlural,
		SaleUnitSingular: input.SaleUnitSingular,
		SaleUnitPlural:   input.SaleUnitPlural,
		SaleUnitFactor:   input.SaleUnitFactor,
		UserFacing:       input.UserFacing,
		DisplayOrder:     input.DisplayOrder,
		//nolint:gosec // bounded to 0..100 by the endpoint schema (minimum/maximum), which huma enforces before the handler runs
		WarningThresholdPercent: int16(input.WarningThresholdPercent),
		ResetPeriod:             dbResetPeriod,
		ResetAnchor:             dbResetAnchor,
	}

	result, err := r.q(ctx).UpdateEntitlement(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("UpdateEntitlement.NotFound", fmt.Sprintf("Entitlement with slug %q not found", slug))
		}
		return nil, err
	}

	return dbmap.ToEntitlement(&result), nil
}

func (r *CommandRepository) AddEntitlementToGroup(ctx context.Context, groupSlug string, entitlementSlug string, organizationID uuid.UUID) error {
	_, err := r.q(ctx).AddEntitlementToGroup(ctx, db.AddEntitlementToGroupParams{
		GroupSlug:       groupSlug,
		EntitlementSlug: entitlementSlug,
		OrganizationID:  organizationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFound("UpdateEntitlement.GroupNotFound", fmt.Sprintf("Entitlement group with slug %q not found", groupSlug))
		}
		if kaitenerrors.IsUniqueViolation(err) {
			return kaitenerrors.Conflict("UpdateEntitlement.GroupAlreadyAssigned", fmt.Sprintf("Entitlement %q is already a member of group %q", entitlementSlug, groupSlug))
		}
		return err
	}

	return nil
}

func (r *CommandRepository) RemoveEntitlementFromGroup(ctx context.Context, groupSlug string, entitlementSlug string, organizationID uuid.UUID) error {
	return r.q(ctx).RemoveEntitlementFromGroup(ctx, db.RemoveEntitlementFromGroupParams{
		GroupSlug:       groupSlug,
		EntitlementSlug: entitlementSlug,
		OrganizationID:  organizationID,
	})
}

// ReplaceSources makes sources the whole of what a combined entitlement sums,
// and its window the one they share. The window is rewritten past
// UpdateEntitlement's one-way door: nothing is stored for a combined
// entitlement that a new window could orphan.
func (r *CommandRepository) ReplaceSources(ctx context.Context, organizationID uuid.UUID, combinedID uuid.UUID, resolved *combined.Resolved) error {
	queries := r.q(ctx)

	if err := queries.DeleteEntitlementSources(ctx, db.DeleteEntitlementSourcesParams{
		OrganizationID: organizationID, CombinedEntitlementID: combinedID,
	}); err != nil {
		return err
	}
	for _, source := range resolved.Sources {
		if err := queries.InsertEntitlementSource(ctx, db.InsertEntitlementSourceParams{
			OrganizationID: organizationID, CombinedEntitlementID: combinedID,
			SourceEntitlementID: source.ID, Weight: source.Weight.String(),
		}); err != nil {
			return err
		}
	}

	var resetPeriod *db.EntitlementResetPeriod
	if resolved.ResetPeriod != nil {
		rp := db.EntitlementResetPeriod(*resolved.ResetPeriod)
		resetPeriod = &rp
	}
	var resetAnchor *db.EntitlementResetAnchor
	if resolved.ResetAnchor != nil {
		ra := db.EntitlementResetAnchor(*resolved.ResetAnchor)
		resetAnchor = &ra
	}

	return queries.SetCombinedEntitlementWindow(ctx, db.SetCombinedEntitlementWindowParams{
		ID: combinedID, OrganizationID: organizationID, ResetPeriod: resetPeriod, ResetAnchor: resetAnchor,
	})
}

// CombinedOf is the slugs of the combined entitlements the entitlement is a
// source of, read once its row is locked: a combined entitlement that was
// storing a link to it has committed or has not read it yet.
func (r *CommandRepository) CombinedOf(ctx context.Context, organizationID uuid.UUID, slug string) ([]string, error) {
	queries := r.q(ctx)

	if _, err := queries.LockEntitlementForUpdate(ctx, db.LockEntitlementForUpdateParams{OrganizationID: organizationID, Slug: slug}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("UpdateEntitlement.NotFound", fmt.Sprintf("Entitlement with slug %q not found", slug))
		}
		return nil, err
	}

	return queries.ListCombinedOfSource(ctx, db.ListCombinedOfSourceParams{OrganizationID: organizationID, SourceSlug: slug})
}
