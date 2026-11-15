// Package localai prepares the trusted local platform rollout flag. It is an
// explicit, convergent profile, never part of identity-only dev startup.
package localai

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	"github.com/kaitencloud/kaiten/api/internal/seeder/profiles/demo"
	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
)

var _ seeder.ConvergentProfile = (*Profile)(nil)

type Profile struct{}

func NewProfile() *Profile    { return &Profile{} }
func (*Profile) Name() string { return "local-ai" }
func (*Profile) Description() string {
	return "[EXPLICIT LOCAL AI] Converges Dogfooding's ai-credits boolean flag: default off, on only for the actual Kaiten Sushi Shop organization. No demo data or credentials."
}
func (*Profile) Converges() {}

func (*Profile) Seed(ctx context.Context, sc *seeder.SeederContext) error {
	orgs := localOrganizations()
	memberships := make([]seedkit.Membership, 0, len(orgs))
	for _, org := range orgs {
		for _, user := range seedkit.DevData.Users {
			memberships = append(memberships, seedkit.Membership{OrganizationID: org.ID, UserID: user.ID})
		}
	}
	orgIDs, userIDs, err := seedkit.SeedOrgsUsersMemberships(ctx, sc, orgs, seedkit.DevData.Users, seedkit.SeedOrgsOptions{ExtraMemberships: memberships})
	if err != nil {
		return err
	}
	// Ensure may find legacy rows with different UUIDs. Neither the target rule,
	// flag ownership nor actor can use the requested/static UUID in that case.
	platformID := orgIDs[seedkit.DevData.DogfoodingOrgExternalID]
	tenantID := orgIDs[demo.OrganizationExternalID]
	ownerID := userIDs[seedkit.DevData.PrimaryUserExternalID]
	if platformID == uuid.Nil || tenantID == uuid.Nil || ownerID == uuid.Nil {
		return fmt.Errorf("local-ai: organization/user bootstrap returned incomplete identities")
	}
	if err := seedkit.SeedFeatureFlags(ctx, sc.WithOrganization(platformID, ownerID), []schema.FeatureFlag{localAIFlag(tenantID)}, true); err != nil {
		return err
	}
	slog.InfoContext(ctx, "local AI rollout flag converged", "platform_organization_id", platformID, "target_organization_id", tenantID)
	return nil
}

func localOrganizations() []organizationschema.Organization {
	orgs := make([]organizationschema.Organization, 0, 2)
	for _, org := range seedkit.DevData.Orgs {
		if org.ExternalID == seedkit.DevData.DogfoodingOrgExternalID {
			orgs = append(orgs, org)
			break
		}
	}
	return append(orgs, organizationschema.Organization{ID: demo.OrganizationID, ExternalID: demo.OrganizationExternalID, Name: demo.OrganizationName})
}
