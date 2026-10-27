package main

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/platformflags"
	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
)

// The source is independent of usage reporting. A configured remote source is
// never replaced with the local database, even if metering itself is off.
func newSeedPlatformFlags(ctx context.Context, pool *pgxpool.Pool, metered config.Metered) (services.PlatformFlags, *dogfooding.Reporter, error) {
	organizationID, err := metered.ResolvePlatformOrgID()
	if err != nil {
		return nil, nil, fmt.Errorf("resolve seeder platform organization: %w", err)
	}
	if !remotePlatformSource(metered) {
		if metered.Enabled {
			return nil, nil, fmt.Errorf("enabled metering requires a remote API and token file")
		}
		return platformflags.New(pool, organizationID), nil, nil
	}
	if strings.TrimSpace(metered.APIURL) == "" || strings.TrimSpace(metered.TokenFile) == "" {
		return nil, nil, fmt.Errorf("remote platform flags require both metered.api_url and metered.token_file")
	}
	reporter, err := dogfooding.NewReporterFor(ctx, metered)
	if err != nil {
		return nil, nil, fmt.Errorf("initialize seeder platform flags: %w", err)
	}
	if organizationID == uuid.Nil {
		// Reporting may still use its client, but there is no pinned platform
		// identity to authorize AI. Match the server's missing-source denial.
		return nil, reporter, nil
	}
	return reporter, reporter, nil
}

func remotePlatformSource(metered config.Metered) bool {
	return strings.TrimSpace(metered.APIURL) != "" || strings.TrimSpace(metered.TokenFile) != ""
}

// Reject the explicit local profile on hosted/reporting configurations before
// touching the database. It is not an organization-scoped demo/bootstrap path.
func validateLocalAIProfile(names []string, metered config.Metered, clean bool) error {
	if !slices.Contains(names, "local-ai") {
		return nil
	}
	if clean {
		return fmt.Errorf("local-ai converges existing flags; it must not be used with --clean")
	}
	if metered.Enabled || remotePlatformSource(metered) {
		return fmt.Errorf("local-ai requires a local platform source with metering off, not a remote API/token")
	}
	if strings.TrimSpace(metered.OrganizationExternalID) != seedkit.DevData.DogfoodingOrgExternalID {
		return fmt.Errorf("local-ai requires KAITEN_METERED_ORGANIZATION_EXTERNAL_ID=%s", seedkit.DevData.DogfoodingOrgExternalID)
	}
	return nil
}
