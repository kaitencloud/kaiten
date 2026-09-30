package externalid

import (
	"testing"

	"github.com/google/uuid"
)

// Golden values pinned so a change to rootNamespace or the derivation
// scheme (which would silently reassign every already-provisioned
// organization/user a new internal id) fails loudly here first.
func TestDeriveGoldenValues(t *testing.T) {
	cases := []struct {
		name string
		got  uuid.UUID
		want string
	}{
		{"OrganizationNamespace", OrganizationNamespace, "56d5ed37-b36f-57d9-a243-528b92587a56"},
		{"UserNamespace", UserNamespace, "6b649446-09b9-5a94-bd05-8980c0423c7a"},
		{"DeriveOrganizationID(org_demo_sandbox)", DeriveOrganizationID("org_demo_sandbox"), "fe8b7f8d-999f-5eb3-b387-73904657253a"},
		{"DeriveOrganizationID(org_dogfooding)", DeriveOrganizationID("org_dogfooding"), "17dfc5dd-7007-5242-96ca-bf74f5f3c4b4"},
		{"DeriveUserID(user_splinter)", DeriveUserID("user_splinter"), "52f59945-dbb4-5107-a9f5-e5a9937d320c"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if c.got.String() != c.want {
				t.Errorf("%s = %s, want %s", c.name, c.got, c.want)
			}
		})
	}
}

func TestDeriveOrganizationIDIsDeterministic(t *testing.T) {
	first := DeriveOrganizationID("org_acme")
	second := DeriveOrganizationID("org_acme")

	if first != second {
		t.Errorf("DeriveOrganizationID(\"org_acme\") = %s then %s, want identical", first, second)
	}
}

func TestDeriveOrganizationAndUserIDsDoNotCollideOnSameString(t *testing.T) {
	shared := "org_acme"

	orgID := DeriveOrganizationID(shared)
	userID := DeriveUserID(shared)

	if orgID == userID {
		t.Errorf("DeriveOrganizationID and DeriveUserID produced the same id %s for the same input string", orgID)
	}
}
