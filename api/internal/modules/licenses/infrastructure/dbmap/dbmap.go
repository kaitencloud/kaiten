// Package dbmap translates between the licenses module's sqlc row types and
// its schema DTOs.
//
// It exists so the translation has a home that is allowed to know both, and
// schema does not. A wire type that imports infrastructure/db inverts the
// dependency the schema package is for: the DTO is what the contract promises
// and the row is what storage happens to hold today, so a schema package that
// names a generated type makes every regeneration a potential contract change.
// The mapping still has to name both -- that is what mapping is -- so it lives
// here, under infrastructure/, where naming a row type is the point rather than
// a leak.
//
// Direction: dbmap imports db and schema; neither imports dbmap. Repositories
// are the callers, which is where a row already exists.
package dbmap

import (
	"fmt"
	"strings"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// NormalizeType upper-cases a caller-supplied type and checks it against the
// SQL enum, returning the db value the write repositories persist. It is the
// single crossing from the API type to the SQL one: db.LicenseType.Scan is a
// generated cast that accepts any string, so without this check an
// unrecognised value reaches the INSERT and comes back as an opaque enum-cast
// error rather than a 400. Today the huma `enum:` tag on License.Type is what
// keeps bad input out at the contract layer; this makes the persistence layer
// stop depending on that.
func NormalizeType(t schema.Type) (db.LicenseType, error) {
	normalized := db.LicenseType(strings.ToUpper(string(t)))
	switch normalized {
	case db.LicenseTypeDEVELOPMENT, db.LicenseTypeTRIAL, db.LicenseTypePAID, db.LicenseTypeCOMMUNITY:
		return normalized, nil
	default:
		return "", fmt.Errorf("unsupported license type %q, expected one of %s, %s, %s, %s",
			string(t), db.LicenseTypeDEVELOPMENT, db.LicenseTypeTRIAL, db.LicenseTypePAID, db.LicenseTypeCOMMUNITY)
	}
}

// NormalizeLifecycleState upper-cases a caller-supplied lifecycle state and
// checks it against the SQL enum, returning the db value the write
// repositories persist. Same job as NormalizeType, for the same reason: the
// generated Scan is a cast that accepts any string, so without this an
// unrecognised value reaches the write and comes back as an opaque enum-cast
// error rather than a 400.
//
// An empty state means "not supplied", which is not this function's business to
// resolve -- createlicense defaults it to PUBLISHED -- so it is rejected here
// rather than silently mapped to it.
func NormalizeLifecycleState(s schema.LifecycleState) (db.LicenseLifecycleState, error) {
	normalized := db.LicenseLifecycleState(strings.ToUpper(string(s)))
	switch normalized {
	case db.LicenseLifecycleStateDRAFT, db.LicenseLifecycleStatePUBLISHED, db.LicenseLifecycleStateARCHIVED:
		return normalized, nil
	default:
		return "", fmt.Errorf("unsupported license lifecycle state %q, expected one of %s, %s, %s",
			string(s), db.LicenseLifecycleStateDRAFT, db.LicenseLifecycleStatePUBLISHED, db.LicenseLifecycleStateARCHIVED)
	}
}

// ToLicense converts a license row into the DTO the API returns.
//
// FamilySlug is deliberately not set: it is write-only on create (see the
// schema.License doc comment). The family is identified on the way out by
// FamilyID, which is on the row, so no read here has to join license_family to
// fill it -- the family's slug is served where the family itself is, by the
// GraphQL family field and the family endpoints.
func ToLicense(license *db.License) (*schema.License, error) {
	return &schema.License{
		ID:          license.ID,
		Name:        license.Name,
		Slug:        license.Slug,
		Description: license.Description,
		Type:        schema.Type(license.Type),
		Version:     fmt.Sprintf("%d", license.Version),
		VersionName: license.VersionName,
		IsDefault:   license.IsDefault,
		FamilyID:    license.FamilyID,

		LifecycleState: schema.LifecycleState(license.LifecycleState),

		CreatedAt: license.CreatedAt.Time,
		UpdatedAt: license.UpdatedAt.Time,

		PricingType:           schema.PricingType(license.PricingType),
		TrialPeriodDays:       license.TrialPeriodDays,
		RequiresPaymentMethod: &license.RequiresPaymentMethod,
		SelfServeCtaURL:       license.SelfServeCtaUrl,
	}, nil
}
