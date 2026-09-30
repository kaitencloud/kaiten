package seedkit

import (
	"github.com/google/uuid"

	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	"github.com/kaitencloud/kaiten/api/pkg/externalid"
)

// Well-known dev user UUIDs, referenced in DevData.Users — deterministically
// derived from each user's external id (see pkg/externalid), the same way JIT
// provisioning would compute them the first time that external id ever logs
// in. Any caller who knows the external id can derive the identical UUID
// locally — no lookup, no coordination with this file required.
var (
	splinterID  = externalid.DeriveUserID("user_splinter")
	leonardoID  = externalid.DeriveUserID("user_leo")
	donatelloID = externalid.DeriveUserID("user_donnie")
	raphaelID   = externalid.DeriveUserID("user_raph")
	aprilID     = externalid.DeriveUserID("user_april")
)

// DevData is the single source of truth for the fictional TMNT-themed dev
// identities shared by all local-dev profiles.
// Using fictional characters keeps OSS-safe (no real employee data).
//
// Orgs/Users use the modules' own reusable schema/domain types directly.
// Auth-provider identity (ExternalID, Email) is bundled via UserIdentity.
var DevData = struct {
	// Organization IDs
	DogfoodingOrgID  uuid.UUID
	TMNTHQOrgID      uuid.UUID
	FootClanOrgID    uuid.UUID
	DemoSandboxOrgID uuid.UUID

	// Organization external IDs, as an identity provider would issue them
	DogfoodingOrgExternalID  string
	TMNTHQOrgExternalID      string
	FootClanOrgExternalID    string
	DemoSandboxOrgExternalID string

	// The external_id of the primary admin user (used to scope SeederContext).
	PrimaryUserExternalID string

	// All @tmnt.io users automatically join every org.
	StaffEmailDomain string

	// Canonical organizations to ensure.
	Orgs []organizationschema.Organization

	// Canonical users to ensure (same UUIDs across every local profile).
	Users []UserIdentity

	// Explicit memberships for non-staff users (those without StaffEmailDomain).
	NonStaffMemberships []Membership
}{
	DogfoodingOrgID: externalid.DeriveOrganizationID("org_dogfooding"),
	// TMNTHQOrgID is the one deliberate exception: a literal
	// 00000000-0000-0000-0000-000000000001 rather than a derived id.
	TMNTHQOrgID:      uuid.MustParse("00000000-0000-0000-0000-000000000001"),
	FootClanOrgID:    externalid.DeriveOrganizationID("org_foot_clan"),
	DemoSandboxOrgID: externalid.DeriveOrganizationID("org_demo_sandbox"),

	DogfoodingOrgExternalID:  "org_dogfooding",
	TMNTHQOrgExternalID:      "org_tmnt_hq",
	FootClanOrgExternalID:    "org_foot_clan",
	DemoSandboxOrgExternalID: "org_demo_sandbox",
	PrimaryUserExternalID:    "user_splinter",
	StaffEmailDomain:         "@tmnt.io",

	Orgs: []organizationschema.Organization{
		{ID: externalid.DeriveOrganizationID("org_dogfooding"), ExternalID: "org_dogfooding", Name: "Kaiten (Dogfooding)"},
		{ID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), ExternalID: "org_tmnt_hq", Name: "TMNT HQ"},
		{ID: externalid.DeriveOrganizationID("org_foot_clan"), ExternalID: "org_foot_clan", Name: "Foot Clan"},
		// Deliberately empty (excluded from stress-test's bulk product-data
		// seeding below): a known, stable local fixture for exercising
		// external tools that seed into a fresh org through Kaiten's public
		// API. Kaiten itself has no "demo" concept attached to it — it's just
		// an empty org with a well-known external id.
		{ID: externalid.DeriveOrganizationID("org_demo_sandbox"), ExternalID: "org_demo_sandbox", Name: "Demo Sandbox"},
	},

	Users: []UserIdentity{
		{User: shared.User{ID: splinterID, Name: "Splinter"}, ExternalID: "user_splinter", Email: "splinter@tmnt.io"},
		{User: shared.User{ID: leonardoID, Name: "Leonardo"}, ExternalID: "user_leo", Email: "leo@tmnt.io"},
		{User: shared.User{ID: donatelloID, Name: "Donatello"}, ExternalID: "user_donnie", Email: "donnie@tmnt.io"},
		{User: shared.User{ID: raphaelID, Name: "Raphael"}, ExternalID: "user_raph", Email: "raph@tmnt.io"},
		{User: shared.User{ID: aprilID, Name: "April O'Neil"}, ExternalID: "user_april", Email: "april@channel6news.com"},
	},

	// April uses a non-@tmnt.io address so she's not staff — explicit memberships required.
	NonStaffMemberships: []Membership{
		{OrganizationID: externalid.DeriveOrganizationID("org_dogfooding"), UserID: aprilID},
		{OrganizationID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), UserID: aprilID},
		{OrganizationID: externalid.DeriveOrganizationID("org_foot_clan"), UserID: aprilID},
	},
}
