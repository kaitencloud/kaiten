package seeder

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
)

// nonEnforcingUsageReporter reports dogfooding usage without ever blocking the
// seed: neither a reached threshold nor an unreachable remote is a wall here.
// Handlers route both through dogfooding.EnforceCreationLimit, which refuses
// the create -- a hard Conflict for the first, a 503 for the second -- and
// either would abort a whole profile over a meter the seed does not depend on.
type nonEnforcingUsageReporter struct {
	services.UsageReporter
}

// NonEnforcing wraps reporter so ReportAndEnforce logs whatever went wrong and
// returns nil instead of the error the handlers enforce on. The underlying
// usage report is still attempted (and rejected server-side above the cap), so
// tracked meters stay truthful while seeding always completes.
//
// This is the seeder's bypass and must stay reachable only from cmd/seeder. It
// is the one place in the tree that deliberately turns an unverifiable
// entitlement limit back into "proceed", which is exactly the behaviour the
// serving API stopped doing: a seed run is an operator populating their own
// deployment, not a tenant consuming what they bought.
func NonEnforcing(reporter services.UsageReporter) services.UsageReporter {
	return &nonEnforcingUsageReporter{UsageReporter: services.UsageReporterOrNoop(reporter)}
}

func (r *nonEnforcingUsageReporter) ReportAndEnforce(ctx context.Context, orgID uuid.UUID, entitlementSlug string) error {
	err := r.UsageReporter.ReportAndEnforce(ctx, orgID, entitlementSlug)
	switch {
	case err == nil:
		return nil
	case errors.Is(err, dogfooding.ErrThresholdExceeded):
		slog.WarnContext(ctx, "dogfooding threshold reached while seeding, continuing",
			"organization_id", orgID, "entitlement_slug", entitlementSlug)
	default:
		// Deliberately not returned. Post-fail-closed this error refuses the
		// create, so propagating it would end the profile at the first
		// unreachable remote -- and a seed whose entitlement meters are
		// approximate is far more useful than one that did not run.
		slog.WarnContext(ctx, "dogfooding usage report failed while seeding, continuing",
			"organization_id", orgID, "entitlement_slug", entitlementSlug, "error", err)
	}
	return nil
}
