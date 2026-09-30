// Package familyview reads the resolved view of one license family: its
// identity, how many versions it has, the version it currently serves and, on
// request, its whole history. The REST family endpoint and the GraphQL
// licenseFamily query both read it through here.
//
// What the two surfaces differ on is what an empty answer means, and that stays
// with each of them: REST reports an unknown family, or one with nothing
// published, as a 404, while GraphQL answers null.
package familyview

import (
	"context"
	"errors"
	"math"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// ErrVersionNotFound is Get's answer when Options.Version names a version the
// family does not have.
var ErrVersionNotFound = errors.New("license family has no such version")

// Options says what a view holds beyond the family and its current version.
type Options struct {
	// Version pins the view to one version by number, whatever its lifecycle
	// state, instead of resolving the version the family serves.
	Version *int32
	// IncludeVersions reads the family's history into Versions, oldest first.
	// VersionCount is then the history's length rather than a separate count.
	IncludeVersions bool
}

// Reader reads family views through the given queries.
type Reader struct {
	queries *db.Queries
}

func NewReader(queries *db.Queries) *Reader {
	return &Reader{queries: queries}
}

// Get returns the view of the family slugged familySlug in the organization,
// and false when the organization has no such family.
//
// CurrentVersion is nil when no version is pinned and the family has nothing
// PUBLISHED; whether that is an error is the caller's call. A pinned version
// the family does not have is ErrVersionNotFound.
func (r *Reader) Get(
	ctx context.Context, organizationID uuid.UUID, familySlug string, opts Options,
) (*schema.LicenseFamilyView, bool, error) {
	family, err := r.queries.GetLicenseFamilyBySlug(ctx, db.GetLicenseFamilyBySlugParams{
		OrganizationID: organizationID,
		Slug:           familySlug,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}

	view, err := r.view(ctx, organizationID, &family, opts)
	if err != nil {
		return nil, false, err
	}
	return view, true, nil
}

// GetByID is Get for a caller that holds the family's identifier rather than
// its slug -- a version write, which knows the family its row points at.
func (r *Reader) GetByID(
	ctx context.Context, organizationID, familyID uuid.UUID, opts Options,
) (*schema.LicenseFamilyView, bool, error) {
	families, err := r.queries.GetLicenseFamiliesByIDs(ctx, db.GetLicenseFamiliesByIDsParams{
		OrganizationID: organizationID,
		FamilyIds:      []uuid.UUID{familyID},
	})
	if err != nil {
		return nil, false, err
	}
	if len(families) == 0 {
		return nil, false, nil
	}

	view, err := r.view(ctx, organizationID, &families[0], opts)
	if err != nil {
		return nil, false, err
	}
	return view, true, nil
}

// view builds the view of a family both lookups have found.
func (r *Reader) view(
	ctx context.Context, organizationID uuid.UUID, family *db.LicenseFamily, opts Options,
) (*schema.LicenseFamilyView, error) {
	view := &schema.LicenseFamilyView{
		ID:        family.ID,
		Slug:      family.Slug,
		CreatedAt: family.CreatedAt.Time,
		UpdatedAt: family.UpdatedAt.Time,
	}

	if opts.IncludeVersions {
		versions, err := r.Versions(ctx, organizationID, family.ID)
		if err != nil {
			return nil, err
		}
		view.Versions = versions
		// Version numbers are int32, so a family's history cannot outgrow one.
		view.VersionCount = int32(min(len(versions), math.MaxInt32))
	} else {
		count, err := r.queries.CountLicenseVersionsInFamily(ctx, db.CountLicenseVersionsInFamilyParams{
			OrganizationID: organizationID,
			FamilyID:       family.ID,
		})
		if err != nil {
			return nil, err
		}
		view.VersionCount = count
	}

	current, err := r.current(ctx, organizationID, family.ID, opts.Version)
	if err != nil {
		return nil, err
	}
	view.CurrentVersion = current

	return view, nil
}

// Versions returns every version of the family, oldest first.
func (r *Reader) Versions(ctx context.Context, organizationID, familyID uuid.UUID) ([]schema.License, error) {
	rows, err := r.queries.ListLicenseVersionsInFamily(ctx, db.ListLicenseVersionsInFamilyParams{
		OrganizationID: organizationID,
		FamilyID:       familyID,
	})
	if err != nil {
		return nil, err
	}

	versions := make([]schema.License, 0, len(rows))
	for i := range rows {
		license, err := dbmap.ToLicense(&rows[i])
		if err != nil {
			return nil, err
		}
		versions = append(versions, *license)
	}
	return versions, nil
}

// current returns the version the view is about: the pinned one, or the one
// the family serves -- nil when it serves nothing.
func (r *Reader) current(
	ctx context.Context, organizationID, familyID uuid.UUID, version *int32,
) (*schema.License, error) {
	if version != nil {
		row, err := r.queries.GetLicenseVersionInFamily(ctx, db.GetLicenseVersionInFamilyParams{
			OrganizationID: organizationID,
			FamilyID:       familyID,
			Version:        *version,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrVersionNotFound
		}
		if err != nil {
			return nil, err
		}
		return dbmap.ToLicense(&row)
	}

	// The resolution rule -- the family's default first, then its
	// highest-numbered published version -- lives in this query and nowhere
	// else, which is what keeps the family list, this view and both protocols
	// agreeing on what "current" means.
	rows, err := r.queries.GetCurrentLicenseVersionsByFamilyIDs(ctx, db.GetCurrentLicenseVersionsByFamilyIDsParams{
		OrganizationID: organizationID,
		FamilyIds:      []uuid.UUID{familyID},
	})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return dbmap.ToLicense(&rows[0])
}
