package graphql

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// GetLicenses returns a cursor-paginated page of licenses for the current
// organization.
func GetLicenses(ctx context.Context, queries *db.Queries, limit int32, cursor *string) (*schema.LicensePage, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	l := pagination.ClampLimit(limit)

	var (
		cursorCreatedAt pgtype.Timestamp
		cursorID        *uuid.UUID
	)
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			// Bad input, not a server fault -- typed so presentError keeps the
			// message, under the code GET /licenses already reports.
			return nil, apierrors.Wrap(err, apierrors.KindValidation, "Licenses.InvalidCursor", "invalid cursor")
		}
		cursorCreatedAt = pgtime.TimePtrToPgTimestamp(&key.CreatedAt)
		cursorID = &key.ID
	}

	licenses, err := queries.GetAllLicensesByCursor(ctx, db.GetAllLicensesByCursorParams{
		OrganizationID:  i.OrganizationID,
		CursorCreatedAt: cursorCreatedAt,
		CursorID:        cursorID,
		LimitPlusOne:    l + 1,
	})
	if err != nil {
		return nil, err
	}

	items, err := toLicenseSchemas(licenses)
	if err != nil {
		return nil, err
	}

	page, err := pagination.BuildPage(items, l, func(license schema.License) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: license.CreatedAt, ID: license.ID}
	})
	if err != nil {
		return nil, err
	}

	return &schema.LicensePage{Items: page.Items, NextCursor: page.NextCursor, HasMore: page.HasMore}, nil
}

// GetLicense returns a single license by ID or slug.
func GetLicense(ctx context.Context, queries *db.Queries, id *uuid.UUID, slug *string) (*schema.License, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	if id != nil {
		licenses, err := queries.GetLicensesByIDs(ctx, db.GetLicensesByIDsParams{
			OrganizationID: i.OrganizationID,
			LicenseIds:     []uuid.UUID{*id},
		})
		if err != nil {
			return nil, err
		}
		if len(licenses) == 0 {
			return nil, nil
		}
		return dbmap.ToLicense(&licenses[0])
	}

	if slug != nil {
		license, err := queries.GetOneLicense(ctx, db.GetOneLicenseParams{
			OrganizationID: i.OrganizationID,
			Slug:           *slug,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil
			}
			return nil, err
		}
		result, err := dbmap.ToLicense(&license)
		if err != nil {
			return nil, err
		}
		return result, nil
	}

	return nil, nil
}

// LoadLicense loads a license using the dataloader.
func LoadLicense(ctx context.Context, id uuid.UUID) (*schema.License, error) {
	loader, err := GetLicenseLoader(ctx)
	if err != nil {
		return nil, err
	}

	thunk := loader.Load(ctx, id)
	license, err := thunk()
	if err != nil {
		return nil, err
	}

	return dbmap.ToLicense(&license)
}

// LoadLicenseFamily loads the family of a license using the dataloader. The
// license row already carries family_id, so this resolves one row by primary
// key -- batched across every license in the response.
func LoadLicenseFamily(ctx context.Context, familyID uuid.UUID) (*schema.LicenseFamily, error) {
	loader, err := GetLicenseFamilyLoader(ctx)
	if err != nil {
		return nil, err
	}

	thunk := loader.Load(ctx, familyID)
	family, err := thunk()
	if err != nil {
		return nil, err
	}

	return &schema.LicenseFamily{ID: family.ID, Slug: family.Slug}, nil
}
