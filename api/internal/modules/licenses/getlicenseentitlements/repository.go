package getlicenseentitlements

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/licenseview"
	entitlementSchema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// licenseEntitlementRow pairs a mapped LicenseEntitlement with the
// underlying license_entitlement.id, which has no equivalent field on the
// public API schema (LicenseEntitlement has no single-field natural key)
// but is needed as the cursor's tie-breaker.
type licenseEntitlementRow struct {
	schema.LicenseEntitlement
	id uuid.UUID
}

// QueryRepository composes this module's own db.Queries with the
// entitlements module's public licenseview.Port for entitlement group
// membership -- it never imports entitlements' own generated db package
// directly.
type QueryRepository struct {
	repository        *db.Queries
	entitlementReader licenseview.Port
}

func NewQueryRepository(repository *db.Queries, entitlementReader licenseview.Port) *QueryRepository {
	return &QueryRepository{
		repository:        repository,
		entitlementReader: entitlementReader,
	}
}

func (r *QueryRepository) GetLicenseEntitlements(ctx context.Context, licenseSlug string, organizationID uuid.UUID, limit int32, cursor *pagination.CreatedAtCursor) (pagination.Page[schema.LicenseEntitlement], error) {
	// Query 1: resolve license slug → ID
	license, err := r.repository.GetOneLicense(ctx, db.GetOneLicenseParams{
		OrganizationID: organizationID,
		Slug:           licenseSlug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return pagination.Page[schema.LicenseEntitlement]{}, kaitenerrors.NotFound("GetLicenseEntitlements.LicenseNotFound", "License with slug "+licenseSlug+" not found")
		}
		return pagination.Page[schema.LicenseEntitlement]{}, err
	}

	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorCreatedAt = &cursor.CreatedAt
		cursorID = &cursor.ID
	}

	// Query 2: fetch a cursor-paginated page of entitlements for this license
	entitlements, err := r.repository.GetEntitlementsForLicenseByCursor(ctx, db.GetEntitlementsForLicenseByCursorParams{
		LicenseID:       license.ID,
		OrganizationID:  organizationID,
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    limit + 1,
	})
	if err != nil {
		return pagination.Page[schema.LicenseEntitlement]{}, err
	}

	// Query 3: fetch all entitlement groups for this license in one shot (replaces N per-entitlement queries)
	groupRows, err := r.entitlementReader.GetGroupRefsForLicense(ctx, organizationID, license.ID)
	if err != nil {
		return pagination.Page[schema.LicenseEntitlement]{}, err
	}

	// Index groups by entitlement slug
	groupsBySlug := make(map[string][]*entitlementSchema.EntitlementGroupSummary, len(groupRows))
	for i := range groupRows {
		g := &groupRows[i]
		groupsBySlug[g.EntitlementSlug] = append(groupsBySlug[g.EntitlementSlug], &entitlementSchema.EntitlementGroupSummary{
			ID:   g.ID,
			Name: g.Name,
			Slug: g.Slug,
		})
	}

	rows := make([]licenseEntitlementRow, len(entitlements))
	for i, ent := range entitlements {
		valueMap, err := entitlementvalue.ToMap(ent.Value)
		if err != nil {
			return pagination.Page[schema.LicenseEntitlement]{}, err
		}

		rows[i] = licenseEntitlementRow{
			id: ent.ID,
			LicenseEntitlement: schema.LicenseEntitlement{
				EntitlementSlug:                ent.EntitlementSlug,
				EntitlementName:                ent.EntitlementName,
				EntitlementType:                string(ent.EntitlementType),
				LicenseID:                      ent.LicenseID,
				LicenseSlug:                    licenseSlug,
				CreatedBy:                      shared.User{ID: ent.CreatedByID, Name: ent.CreatedByName},
				CreatedAt:                      ent.CreatedAt.Time,
				UpdatedBy:                      shared.User{ID: ent.UpdatedByID, Name: ent.UpdatedByName},
				UpdatedAt:                      ent.UpdatedAt.Time,
				Value:                          valueMap,
				LimitCapExceededOveragePercent: int16PtrToInt32Ptr(ent.LimitCapExceededOveragePercent),
				EntitlementGroups:              groupsBySlug[ent.EntitlementSlug],
			},
		}
	}

	rowPage, err := pagination.BuildPage(rows, limit, func(row licenseEntitlementRow) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: row.CreatedAt, ID: row.id}
	})
	if err != nil {
		return pagination.Page[schema.LicenseEntitlement]{}, err
	}

	items := make([]schema.LicenseEntitlement, len(rowPage.Items))
	for i, row := range rowPage.Items {
		items[i] = row.LicenseEntitlement
	}

	return pagination.Page[schema.LicenseEntitlement]{
		Items:      items,
		NextCursor: rowPage.NextCursor,
		HasMore:    rowPage.HasMore,
	}, nil
}

// int16PtrToInt32Ptr widens the SMALLINT column's Go representation to the
// API's int32, preserving nil (non-numeric grants have no overage percent).
func int16PtrToInt32Ptr(v *int16) *int32 {
	if v == nil {
		return nil
	}
	result := int32(*v)
	return &result
}
