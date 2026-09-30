package createentitlement

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/grouprefs"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type CreateEntitlementInput struct {
	Name                    string
	Description             *string
	Type                    schema.Type
	AggregationMethod       *schema.AggregationMethod
	Slug                    string
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

func (r *CommandRepository) CreateEntitlement(ctx context.Context, input CreateEntitlementInput, organizationID uuid.UUID) (*schema.Entitlement, error) {
	var entitlementType db.EntitlementType
	if err := entitlementType.Scan(string(input.Type)); err != nil {
		return nil, err
	}

	var aggregationMethod *db.AggregationMethod
	if input.AggregationMethod != nil {
		am := db.AggregationMethod(string(*input.AggregationMethod))
		if err := am.Scan(string(*input.AggregationMethod)); err != nil {
			return nil, err
		}
		aggregationMethod = &am
	}

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

	params := db.CreateEntitlementParams{
		Name:              input.Name,
		Slug:              input.Slug,
		Description:       input.Description,
		Type:              entitlementType,
		AggregationMethod: aggregationMethod,
		OrganizationID:    organizationID,
		Icon:              input.Icon,
		UnitSingular:      input.UnitSingular,
		UnitPlural:        input.UnitPlural,
		SaleUnitSingular:  input.SaleUnitSingular,
		SaleUnitPlural:    input.SaleUnitPlural,
		SaleUnitFactor:    input.SaleUnitFactor,
		UserFacing:        input.UserFacing,
		DisplayOrder:      input.DisplayOrder,
		//nolint:gosec // bounded to 0..100 by the endpoint schema (minimum/maximum), which huma enforces before the handler runs
		WarningThresholdPercent: int16(input.WarningThresholdPercent),
		ResetPeriod:             dbResetPeriod,
		ResetAnchor:             dbResetAnchor,
	}

	entitlement, err := r.q(ctx).CreateEntitlement(ctx, params)
	if err != nil {
		if kaitenerrors.IsUniqueViolation(err) {
			// entitlement's only UNIQUE constraint besides the primary key
			// is (organization_id, slug), so any unique violation here is a
			// slug conflict. Wrapping slugutil.ErrConflict lets
			// slugutil.Retry recognize this as retryable when the slug was
			// auto-generated.
			return nil, kaitenerrors.Wrap(slugutil.ErrConflict, kaitenerrors.KindConflict,
				"CreateEntitlement.SlugConflict", fmt.Sprintf("Entitlement with slug %q already exists in this organization", input.Slug))
		}
		return nil, err
	}

	return dbmap.ToEntitlement(&entitlement), nil
}

func (r *CommandRepository) GetEntitlement(ctx context.Context, slug string, organizationID uuid.UUID) (*schema.Entitlement, error) {
	queries := r.q(ctx)

	entitlement, err := queries.GetEntitlement(ctx, db.GetEntitlementParams{
		Slug:           slug,
		OrganizationID: organizationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("CreateEntitlement.NotFound", fmt.Sprintf("Entitlement with slug %q not found", slug))
		}
		return nil, err
	}

	result := dbmap.ToEntitlement(&entitlement)
	result.EntitlementGroups, err = grouprefs.LoadForEntitlement(ctx, queries, slug, organizationID)
	if err != nil {
		return nil, err
	}

	return result, nil
}

func (r *CommandRepository) AddEntitlementToGroup(ctx context.Context, groupSlug string, entitlementSlug string, organizationID uuid.UUID) error {
	_, err := r.q(ctx).AddEntitlementToGroup(ctx, db.AddEntitlementToGroupParams{
		GroupSlug:       groupSlug,
		EntitlementSlug: entitlementSlug,
		OrganizationID:  organizationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFound("CreateEntitlement.GroupNotFound", fmt.Sprintf("Entitlement group with slug %q not found", groupSlug))
		}
		if kaitenerrors.IsUniqueViolation(err) {
			return kaitenerrors.Conflict("CreateEntitlement.GroupAlreadyAssigned", fmt.Sprintf("Entitlement %q is already a member of group %q", entitlementSlug, groupSlug))
		}
		return err
	}

	return nil
}
