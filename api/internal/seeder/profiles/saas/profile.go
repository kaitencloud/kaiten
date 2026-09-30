// Package saas implements the SaaS-context identity/org bootstrap: the five
// shared TMNT identities on Kaiten's own Dogfooding org and the (always
// empty) Demo Sandbox org. No product data -- Dogfooding never gets any
// (it is the organization Kaiten uses to meter itself), and Demo Sandbox stays
// empty by design, filled only through the in-app Seed flow of the service that
// hosts it.
//
// This is the SaaS-stack counterpart of the OSS-only `dev` profile: same
// shared identities (seedkit.DevData.Users), different org(s), invoked
// instead of `dev` when the SaaS stack's compose overrides seed-accounts.
package saas

import (
	"context"
	"strings"

	"github.com/kaitencloud/kaiten/api/internal/seeder"
	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
)

var _ seeder.Profile = (*Profile)(nil)

// Profile is the SaaS local-stack identity/org bootstrap profile.
type Profile struct{}

// NewProfile returns a new saas Profile instance.
func NewProfile() *Profile { return &Profile{} }

func (p *Profile) Name() string { return "saas" }

func (p *Profile) Description() string {
	return "[SAAS LOCAL DEV] Seeds the five TMNT identities on Kaiten (Dogfooding) and an empty Demo Sandbox, no product data. Used when running the SaaS stack instead of `dev`."
}

func (p *Profile) Seed(ctx context.Context, sc *seeder.SeederContext) error {
	_, _, err := seedkit.SeedOrgsUsersMemberships(ctx, sc, orgs, seedkit.DevData.Users, seedkit.SeedOrgsOptions{
		StaffEmailDomain: seedkit.DevData.StaffEmailDomain,
		ExtraMemberships: extraMemberships,
	})
	return err
}

// TokenTargets tells cmd/seeder's tokens command who should get a local dev
// switcher token for each org this profile creates, mirroring exactly what
// Seed grants membership to above: all five identities on Dogfooding (staff
// auto-join, April explicit), the four staff only on Demo Sandbox (April is
// deliberately not a member there).
func TokenTargets() []seedkit.TokenTarget {
	staff := staffOnly(seedkit.DevData.Users, seedkit.DevData.StaffEmailDomain)

	targets := make([]seedkit.TokenTarget, 0, len(orgs))
	for _, org := range orgs {
		users := staff
		if org.ExternalID == seedkit.DevData.DogfoodingOrgExternalID {
			users = seedkit.DevData.Users
		}
		targets = append(targets, seedkit.TokenTarget{Org: org, Users: users})
	}
	return targets
}

func staffOnly(users []seedkit.UserIdentity, staffEmailDomain string) []seedkit.UserIdentity {
	staff := make([]seedkit.UserIdentity, 0, len(users))
	for _, u := range users {
		if strings.HasSuffix(u.Email, staffEmailDomain) {
			staff = append(staff, u)
		}
	}
	return staff
}
