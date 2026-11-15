package graphql

import (
	"context"
	"fmt"
	"strconv"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familyview"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// GetLicenseFamilyView resolves a family to the version it currently serves,
// for the GraphQL licenseFamily query.
//
// It reads the same view the REST family endpoint does (familyview), so the two
// surfaces cannot come to disagree about what "current" means. They differ on
// the empty cases, following each protocol's grain: a missing family is a null
// here rather than the REST 404, and a family with nothing published resolves
// with a null currentVersion rather than the REST NoPublishedVersion error -- a
// caller asking for `currentVersion { slug }` gets null and carries on, instead
// of having the whole query fail.
//
// The history is not read here: LicenseFamilyView.versions has its own
// resolver, LicenseFamilyVersions, which only runs when a query selects it.
func GetLicenseFamilyView(ctx context.Context, queries *db.Queries, slug string) (*schema.LicenseFamilyView, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	view, found, err := familyview.NewReader(queries).Get(ctx, i.OrganizationID, slug, familyview.Options{})
	if err != nil || !found {
		return nil, err
	}
	return view, nil
}

// LicenseFamilyVersions returns every version of a family, oldest first, for
// the LicenseFamilyView.versions field. Scoped to the caller's organization
// like the view it hangs off.
func LicenseFamilyVersions(ctx context.Context, queries *db.Queries, familyID uuid.UUID) ([]schema.License, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	return familyview.NewReader(queries).Versions(ctx, i.OrganizationID, familyID)
}

// LoadLicenseFamilyCurrentVersion is the version a family currently serves,
// for the LicenseFamily.currentVersion field: nil when nothing is PUBLISHED.
// Batched across every family of the response.
func LoadLicenseFamilyCurrentVersion(ctx context.Context, familyID uuid.UUID) (*schema.License, error) {
	loader, err := dataloader.GetLoader[uuid.UUID, *db.License](dataloader.LoadersFromContext(ctx), LicenseFamilyCurrentVersionLoaderName)
	if err != nil {
		return nil, err
	}
	current, err := loader.Load(ctx, familyID)()
	if err != nil || current == nil {
		return nil, err
	}
	return dbmap.ToLicense(current)
}

// VersionNumber is License.version as the number it is: the order of the
// versions in their family.
func VersionNumber(license *schema.License) (int, error) {
	number, err := strconv.Atoi(license.Version)
	if err != nil {
		return 0, fmt.Errorf("license %s has a version that is not a number: %w", license.ID, err)
	}
	return number, nil
}
