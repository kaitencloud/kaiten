package listentitlementresources

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/effectivelookup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

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

// List reads up to limitPlusOne resources after the key `after`, each with its
// counter in the usage window current when the page is read. The pair is
// resolved as the entitlement's usage read resolves it, except that the grant is
// not required: a resource outlives a licence that no longer grants its
// entitlement, and is still listed.
func (r *QueryRepository) List(ctx context.Context, instanceSlug, entitlementSlug string, organizationID uuid.UUID, after *string, limitPlusOne int32) ([]schema.EntitlementResource, error) {
	ctx = r.policy.ForOrganization(ctx, organizationID)

	if !r.policy.Enabled(ctx) {
		target, err := r.repository.GetEntitlementContextBySlug(ctx, db.GetEntitlementContextBySlugParams{OrganizationID: organizationID, InstanceSlug: instanceSlug, EntitlementSlug: entitlementSlug})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		if err == nil {
			if err := r.policy.RequireType(ctx, string(target.EntitlementType)); err != nil {
				return nil, err
			}
		}
	}
	// The pair, its window configuration and the instant they are read at, in
	// one statement: the usage clock, never the application node's.
	done := effectivelookup.Time(ctx, effectivelookup.ReaderREST)
	pair, err := r.repository.GetEntitlementUsageForInstanceOrDefault(ctx, db.GetEntitlementUsageForInstanceOrDefaultParams{
		ResourceKey:     nil,
		OrganizationID:  organizationID,
		InstanceSlug:    instanceSlug,
		EntitlementSlug: entitlementSlug,
	})
	done()
	if err != nil {
		return nil, err
	}
	if pair.InstanceID == nil {
		return nil, kaitenerrors.NotFoundf(operation+".InstanceNotFound", "Instance with slug %q not found", instanceSlug)
	}
	if pair.EntitlementID == nil {
		return nil, kaitenerrors.NotFoundf(operation+".EntitlementNotFound", "Entitlement with slug %q not found", entitlementSlug)
	}
	if pair.EntitlementType != nil {
		if err := r.policy.RequireType(ctx, string(*pair.EntitlementType)); err != nil {
			return nil, err
		}
	}
	if pair.LimitScope == nil || *pair.LimitScope != db.EntitlementLimitScopeRESOURCE {
		return nil, kaitenerrors.UnprocessableEntityf(operation+".NotPerResource",
			"entitlement %q counts per instance: it has no resources", entitlementSlug)
	}

	rows, err := r.repository.ListEntitlementResources(ctx, db.ListEntitlementResourcesParams{
		OrganizationID: organizationID,
		InstanceID:     *pair.InstanceID,
		EntitlementID:  *pair.EntitlementID,
		AfterKey:       after,
		LimitPlusOne:   limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	now := pair.Now.Time.UTC()
	var basis period.Basis
	if pair.ResetPeriod != nil {
		basis = period.NewBasis(pair.StartLicenseDate.Time.UTC(), pair.BillingStatus,
			pgtime.PgTimeStampToTimePtr(pair.BillingAnchorAt), pgtime.PgTimeStampToTimePtr(pair.LiveEndedAt))
	}

	items := make([]schema.EntitlementResource, 0, len(rows))
	for _, row := range rows {
		stored, err := entitlementvalue.ParseNumberUsageValue(row.Value)
		if err != nil {
			return nil, kaitenerrors.Validation(operation+".InvalidUsageValue", err.Error())
		}

		counter := stored
		item := schema.EntitlementResource{ResourceKey: row.ResourceKey}
		if pair.ResetPeriod != nil {
			var storedPeriodStart *time.Time
			if row.PeriodStart.Valid {
				storedPeriodStart = ptr.To(row.PeriodStart.Time.UTC())
			}
			window, _, err := period.ResolveCurrentOn(now, storedPeriodStart, period.ResetPeriod(*pair.ResetPeriod), period.ResetAnchor(*pair.ResetAnchor), basis)
			if err != nil {
				return nil, err
			}
			counter = entitlementvalue.ResolveCurrentWindowUsage(stored, storedPeriodStart, window)
			item.CurrentPeriodStart, item.CurrentPeriodEnd = &window.Start, &window.End
		}
		item.Value = schema.NumberEntitlementValue{Type: "number", Value: counter.Value, EventCount: counter.EventCount}
		items = append(items, item)
	}
	return items, nil
}
