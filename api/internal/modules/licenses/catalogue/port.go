// Package catalogue is the licenses module's public read port for listing an
// organization's plans (license families) and every version of them.
// Consumed by featureflags, to describe them to the targeting rule editor and
// to lint a rule's comparison with one of their slugs at write time, instead
// of reaching into this module's own generated db package directly.
package catalogue

import (
	"cmp"
	"context"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// Plan is one license family: the product a license is a version of. A family
// has a slug and no name of its own; Name is the name of the version the family
// serves (its default, else its highest published one), or of its newest
// version when nothing is published.
type Plan struct {
	Slug string
	Name string
}

// Version is one license version, whatever its lifecycle state: an instance can
// sit on an archived one, so a rule naming it is still about something real.
type Version struct {
	Slug   string
	Name   string
	Number int32
	State  schema.LifecycleState
}

// Catalogue is what an organization has, read in one pass so its two lists are
// consistent with each other.
type Catalogue struct {
	Plans    []Plan
	Versions []Version
}

type Port interface {
	List(ctx context.Context, organizationID uuid.UUID) (Catalogue, error)
}

type port struct {
	queries *db.Queries
}

// New builds a Port bound to the given pool. Reads never need to join a
// caller's transaction, so this binds to the pool directly rather than
// taking a uow.DBTX.
func New(pool *pgxpool.Pool) Port {
	return &port{queries: db.New(pool)}
}

func (p *port) List(ctx context.Context, organizationID uuid.UUID) (Catalogue, error) {
	licenses, err := p.queries.GetAllLicenses(ctx, organizationID)
	if err != nil {
		return Catalogue{}, err
	}

	byFamily := map[uuid.UUID][]db.License{}
	familyIDs := make([]uuid.UUID, 0)
	for _, license := range licenses {
		if _, seen := byFamily[license.FamilyID]; !seen {
			familyIDs = append(familyIDs, license.FamilyID)
		}
		byFamily[license.FamilyID] = append(byFamily[license.FamilyID], license)
	}

	families, err := p.queries.GetLicenseFamiliesByIDs(ctx, db.GetLicenseFamiliesByIDsParams{
		OrganizationID: organizationID,
		FamilyIds:      familyIDs,
	})
	if err != nil {
		return Catalogue{}, err
	}

	catalogue := Catalogue{
		Plans:    make([]Plan, 0, len(families)),
		Versions: make([]Version, 0, len(licenses)),
	}

	for _, family := range families {
		catalogue.Plans = append(catalogue.Plans, Plan{Slug: family.Slug, Name: servedName(byFamily[family.ID])})
	}
	for _, license := range licenses {
		catalogue.Versions = append(catalogue.Versions, Version{
			Slug:   license.Slug,
			Name:   license.Name,
			Number: license.Version,
			State:  schema.LifecycleState(license.LifecycleState),
		})
	}

	slices.SortFunc(catalogue.Plans, func(a, b Plan) int { return cmp.Compare(a.Slug, b.Slug) })
	slices.SortFunc(catalogue.Versions, func(a, b Version) int { return cmp.Compare(a.Slug, b.Slug) })

	return catalogue, nil
}

// servedName is the name of the version a family puts forward, by the rule the
// rest of the API resolves "the current version" with: the default first, then
// the highest-numbered among the PUBLISHED ones. A family with nothing
// published falls back to its newest version, so it still has a name to show.
func servedName(versions []db.License) string {
	var served *db.License

	for i := range versions {
		candidate := &versions[i]
		if candidate.LifecycleState != db.LicenseLifecycleStatePUBLISHED {
			continue
		}
		if served == nil || (candidate.IsDefault && !served.IsDefault) ||
			(candidate.IsDefault == served.IsDefault && candidate.Version > served.Version) {
			served = candidate
		}
	}

	if served == nil {
		for i := range versions {
			if served == nil || versions[i].Version > served.Version {
				served = &versions[i]
			}
		}
	}

	if served == nil {
		return ""
	}

	return served.Name
}
