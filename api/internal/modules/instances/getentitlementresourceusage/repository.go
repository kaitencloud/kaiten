package getentitlementresourceusage

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/effectivelookup"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getentitlementusagemetrics"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// operation prefixes this operation's error codes.
const operation = "GetEntitlementResourceUsage"

type QueryRepository struct {
	policy     aiusage.Policy
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries, policies ...aiusage.Policy) *QueryRepository {
	policy := aiusage.Policy{}
	if len(policies) > 0 {
		policy = policies[0]
	}
	return &QueryRepository{policy: policy, repository: repository}
}

// GetEntitlementResourceUsage reads one resource's usage and the id of the
// instance it was read on. The pair is resolved as GetEntitlementUsageMetrics
// resolves it -- the instance, the entitlement, the grant -- and refused when
// the entitlement does not count per resource. A resource that holds no counter
// reads zero.
func (r *QueryRepository) GetEntitlementResourceUsage(ctx context.Context, instanceSlug, entitlementSlug, resourceKey string, organizationID uuid.UUID) (*schema.EntitlementUsage, uuid.UUID, error) {
	ctx = r.policy.ForOrganization(ctx, organizationID)

	if !r.policy.Enabled(ctx) {
		target, err := r.repository.GetEntitlementContextBySlug(ctx, db.GetEntitlementContextBySlugParams{OrganizationID: organizationID, InstanceSlug: instanceSlug, EntitlementSlug: entitlementSlug})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, uuid.Nil, err
		}
		if err == nil {
			if err := r.policy.RequireType(ctx, string(target.EntitlementType)); err != nil {
				return nil, uuid.Nil, err
			}
		}
	}
	done := effectivelookup.Time(ctx, effectivelookup.ReaderREST)
	result, err := r.repository.GetEntitlementUsageForInstanceOrDefault(ctx, db.GetEntitlementUsageForInstanceOrDefaultParams{
		ResourceKey:     &resourceKey,
		OrganizationID:  organizationID,
		InstanceSlug:    instanceSlug,
		EntitlementSlug: entitlementSlug,
	})
	done()
	if err != nil {
		return nil, uuid.Nil, err
	}

	if result.InstanceID == nil {
		return nil, uuid.Nil, kaitenerrors.NotFoundf(operation+".InstanceNotFound", "Instance with slug %q not found", instanceSlug)
	}
	if result.EntitlementID == nil {
		return nil, uuid.Nil, kaitenerrors.NotFoundf(operation+".EntitlementNotFound", "Entitlement with slug %q not found", entitlementSlug)
	}
	if result.EntitlementType != nil {
		if err := r.policy.RequireType(ctx, string(*result.EntitlementType)); err != nil {
			return nil, uuid.Nil, err
		}
	}
	if result.LimitScope == nil || *result.LimitScope != db.EntitlementLimitScopeRESOURCE {
		return nil, uuid.Nil, kaitenerrors.UnprocessableEntityf(operation+".NotPerResource",
			"entitlement %q counts per instance: it has no resources, and its usage is read at GET /instances/{instanceSlug}/entitlements/%s/usage", entitlementSlug, entitlementSlug)
	}
	if result.GrantedEntitlementID == nil {
		return nil, uuid.Nil, kaitenerrors.NotFoundf(operation+".EntitlementNotAssigned", "Entitlement with slug %q is not assigned to the license used by instance %q", entitlementSlug, instanceSlug)
	}

	usage, err := getentitlementusagemetrics.UsageOf(result, &resourceKey)
	if err != nil {
		return nil, uuid.Nil, err
	}
	return usage, *result.InstanceID, nil
}
