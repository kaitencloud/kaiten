package saas

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
)

// TestOrgsExcludeTMNTHQAndFootClan guards the whole point of this package:
// only Dogfooding and Demo Sandbox belong to the SaaS local stack.
func TestOrgsExcludeTMNTHQAndFootClan(t *testing.T) {
	externalIDs := make(map[string]bool, len(orgs))
	for _, org := range orgs {
		externalIDs[org.ExternalID] = true
	}

	require.Len(t, orgs, 2)
	require.True(t, externalIDs[seedkit.DevData.DogfoodingOrgExternalID])
	require.True(t, externalIDs[seedkit.DevData.DemoSandboxOrgExternalID])
	require.False(t, externalIDs["org_tmnt_hq"])
	require.False(t, externalIDs["org_foot_clan"])
}

// TestExtraMembershipsOnlyReferenceCreatedOrgs guards the foreign-key bug
// this package exists to avoid: every explicit membership must target an
// organization this profile actually creates, or SeedOrgsUsersMemberships
// fails resolving a membership against a row that doesn't exist here.
func TestExtraMembershipsOnlyReferenceCreatedOrgs(t *testing.T) {
	createdOrgIDs := make(map[string]bool, len(orgs))
	for _, org := range orgs {
		createdOrgIDs[org.ID.String()] = true
	}

	require.NotEmpty(t, extraMemberships, "expected at least April's Dogfooding membership")
	for _, m := range extraMemberships {
		require.Truef(t, createdOrgIDs[m.OrganizationID.String()], "extra membership references organization %s, which this profile never creates", m.OrganizationID)
	}
}

// TestTokenTargetsMatchSeedMemberships guards the tokens command's switcher
// entries against drifting from what Seed actually grants: all five
// identities on Dogfooding, the four staff only (no April) on Demo Sandbox.
func TestTokenTargetsMatchSeedMemberships(t *testing.T) {
	targets := TokenTargets()
	require.Len(t, targets, 2)

	byExternalID := make(map[string][]seedkit.UserIdentity, len(targets))
	for _, target := range targets {
		byExternalID[target.Org.ExternalID] = target.Users
	}

	require.Len(t, byExternalID[seedkit.DevData.DogfoodingOrgExternalID], 5)
	require.Len(t, byExternalID[seedkit.DevData.DemoSandboxOrgExternalID], 4)

	for _, u := range byExternalID[seedkit.DevData.DemoSandboxOrgExternalID] {
		require.NotEqual(t, "user_april", u.ExternalID, "April must not be a Demo Sandbox member")
	}
}
