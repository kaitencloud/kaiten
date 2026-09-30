package saas

import (
	"github.com/google/uuid"

	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
)

// orgs is the subset of seedkit.DevData's four organizations this profile
// creates: Dogfooding (kaiten's own self-metering org) and Demo Sandbox
// (empty, filled only through the in-app Seed flow). TMNT HQ and Foot Clan
// are deliberately excluded -- those exist only for stress-test's own bulk
// seed, not for the SaaS local stack.
var orgs = filterOrgs(seedkit.DevData.Orgs, seedkit.DevData.DogfoodingOrgExternalID, seedkit.DevData.DemoSandboxOrgExternalID)

// extraMemberships is April's membership on Dogfooding only, filtered out of
// seedkit.DevData.NonStaffMemberships (which also carries her TMNT HQ and
// Foot Clan memberships). Passing those through unfiltered would have
// SeedOrgsUsersMemberships try to grant her membership on organizations this
// profile never creates -- a foreign-key violation, not a no-op.
var extraMemberships = filterMemberships(seedkit.DevData.NonStaffMemberships, seedkit.DevData.DogfoodingOrgID)

func filterOrgs(all []organizationschema.Organization, externalIDs ...string) []organizationschema.Organization {
	want := make(map[string]bool, len(externalIDs))
	for _, id := range externalIDs {
		want[id] = true
	}

	filtered := make([]organizationschema.Organization, 0, len(externalIDs))
	for _, org := range all {
		if want[org.ExternalID] {
			filtered = append(filtered, org)
		}
	}
	return filtered
}

func filterMemberships(all []seedkit.Membership, organizationID uuid.UUID) []seedkit.Membership {
	filtered := make([]seedkit.Membership, 0, len(all))
	for _, m := range all {
		if m.OrganizationID == organizationID {
			filtered = append(filtered, m)
		}
	}
	return filtered
}
