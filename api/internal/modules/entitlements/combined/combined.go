// Package combined is what creating and updating a combined entitlement share:
// reading the entitlements it would sum under their lock, checking that they
// can be summed, and the window they give it.
//
// A combined entitlement (usageSource COMBINED_USAGE) is the weighted sum of
// the usage of other entitlements, its sources, computed when it is read. Both
// writers call Resolve inside their transaction, so what they check is still
// true when they store the links.
package combined

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Source is a source entitlement, as stored, with the weight it is summed at.
type Source struct {
	ID     uuid.UUID
	Slug   string
	Weight decimal.Decimal
}

// Resolved is what a combined entitlement's sources come to: the entitlements,
// and the window they all share. A nil window is the lifetime one.
type Resolved struct {
	Sources     []Source
	ResetPeriod *period.ResetPeriod
	ResetAnchor *period.ResetAnchor
}

// Parse validates the sources a request names -- at least two, each named once,
// each weight an exact, strictly positive decimal -- and answers a refusal with
// its own code: <operation>.CombinedSourcesRequired, .CombinedSourceDuplicate or
// .CombinedSourceWeightInvalid (422).
func Parse(operation string, sources []schema.EntitlementSource) ([]schema.ParsedSource, error) {
	parsed, err := schema.ValidateCombinedSources(sources)
	switch {
	case err == nil:
		return parsed, nil
	case errors.Is(err, schema.ErrSourcesRequired):
		return nil, kaitenerrors.UnprocessableEntity(operation+".CombinedSourcesRequired", err.Error())
	case errors.Is(err, schema.ErrSourceDuplicate):
		return nil, kaitenerrors.UnprocessableEntity(operation+".CombinedSourceDuplicate", err.Error())
	default:
		return nil, kaitenerrors.UnprocessableEntity(operation+".CombinedSourceWeightInvalid", err.Error())
	}
}

// RefuseWarningThreshold refuses a warning threshold above 0 on a combined
// entitlement: nothing crosses on a sum, so there is no crossing to warn about.
// 0 is what the API answers for every NUMBER, and is accepted.
func RefuseWarningThreshold(operation string, warningThresholdPercent *int32) error {
	if warningThresholdPercent != nil && *warningThresholdPercent > 0 {
		return kaitenerrors.UnprocessableEntity(operation+".CombinedWarningThreshold",
			"a combined entitlement has no warning threshold: events fire on its sources, not on their sum")
	}
	return nil
}

// Resolve reads the entitlements the request names, share-locked until the
// transaction ends, and checks that they can be summed. A source is, in the
// organization:
//   - a NUMBER or NUMBER_AI_CREDIT entitlement (.SourceUnsupportedType, 422), the
//     AI pool answering AIUsage.Disabled while AI is off;
//   - not combined itself: no sum of sums (.SourceIsCombined, 422);
//   - aggregated by SUM or COUNT: a weighted sum of an average, a maximum or a
//     latest value means nothing (.SourceUnsupportedAggregation, 422);
//   - on the same resetPeriod and resetAnchor as the others, lifetime included
//     (.SourceWindowMismatch, 422).
//
// An entitlement the organization does not have is .SourceNotFound (404).
func Resolve(
	ctx context.Context, q *db.Queries, policy aiusage.Policy, organizationID uuid.UUID,
	operation string, sources []schema.ParsedSource,
) (*Resolved, error) {
	slugs := make([]string, len(sources))
	for i, source := range sources {
		slugs[i] = source.EntitlementSlug
	}

	rows, err := q.LockSourceEntitlements(ctx, db.LockSourceEntitlementsParams{OrganizationID: organizationID, Slugs: slugs})
	if err != nil {
		return nil, err
	}
	bySlug := make(map[string]db.LockSourceEntitlementsRow, len(rows))
	for _, row := range rows {
		bySlug[row.Slug] = row
	}

	resolved := &Resolved{Sources: make([]Source, 0, len(sources))}
	for i, named := range sources {
		row, found := bySlug[named.EntitlementSlug]
		if !found {
			return nil, kaitenerrors.NotFoundf(operation+".SourceNotFound", "source entitlement %q not found", named.EntitlementSlug)
		}
		if err := policy.RequireType(ctx, string(row.Type)); err != nil {
			return nil, err
		}
		if row.Type != db.EntitlementTypeNUMBER && row.Type != db.EntitlementTypeNUMBERAICREDIT {
			return nil, kaitenerrors.UnprocessableEntityf(operation+".SourceUnsupportedType",
				"source %q is a %s entitlement: only a NUMBER or NUMBER_AI_CREDIT entitlement can be summed", row.Slug, row.Type)
		}
		if row.UsageSource == db.EntitlementUsageSourceCOMBINEDUSAGE {
			return nil, kaitenerrors.UnprocessableEntityf(operation+".SourceIsCombined",
				"source %q is a combined entitlement itself: a combined entitlement cannot sum another", row.Slug)
		}
		if row.AggregationMethod == nil ||
			(*row.AggregationMethod != db.AggregationMethodSUM && *row.AggregationMethod != db.AggregationMethodCOUNT) {
			return nil, kaitenerrors.UnprocessableEntityf(operation+".SourceUnsupportedAggregation",
				"source %q is not aggregated by SUM or COUNT: a weighted sum of an average, a maximum or a latest value means nothing", row.Slug)
		}

		var resetPeriod *period.ResetPeriod
		if row.ResetPeriod != nil {
			rp := period.ResetPeriod(*row.ResetPeriod)
			resetPeriod = &rp
		}
		var resetAnchor *period.ResetAnchor
		if row.ResetAnchor != nil {
			ra := period.ResetAnchor(*row.ResetAnchor)
			resetAnchor = &ra
		}
		if i == 0 {
			resolved.ResetPeriod, resolved.ResetAnchor = resetPeriod, resetAnchor
		} else if !sameWindow(resolved.ResetPeriod, resolved.ResetAnchor, resetPeriod, resetAnchor) {
			return nil, kaitenerrors.UnprocessableEntityf(operation+".SourceWindowMismatch",
				"source %q is on %s, where %q is on %s: the sources of a combined entitlement share one reset period and anchor, lifetime included",
				row.Slug, describeWindow(resetPeriod, resetAnchor), sources[0].EntitlementSlug,
				describeWindow(resolved.ResetPeriod, resolved.ResetAnchor))
		}

		resolved.Sources = append(resolved.Sources, Source{ID: row.ID, Slug: row.Slug, Weight: named.Weight})
	}

	return resolved, nil
}

// CheckWindow refuses a resetPeriod or resetAnchor the caller sent that is not
// the one the sources share (.CombinedWindowMismatch, 422): a combined
// entitlement takes its window from its sources, and a PUT that echoes the
// stored one while changing the sources to another window is told the one it
// gets. Sending neither is accepted.
func (r *Resolved) CheckWindow(operation string, sentPeriod *period.ResetPeriod, sentAnchor *period.ResetAnchor) error {
	if sentPeriod == nil && sentAnchor == nil {
		return nil
	}
	if sameWindow(sentPeriod, sentAnchor, r.ResetPeriod, r.ResetAnchor) {
		return nil
	}
	return kaitenerrors.UnprocessableEntityf(operation+".CombinedWindowMismatch",
		"a combined entitlement takes its window from its sources, which are on %s: omit resetPeriod and resetAnchor, or send those",
		describeWindow(r.ResetPeriod, r.ResetAnchor))
}

func sameWindow(periodA *period.ResetPeriod, anchorA *period.ResetAnchor, periodB *period.ResetPeriod, anchorB *period.ResetAnchor) bool {
	return ptrEqual(periodA, periodB) && ptrEqual(anchorA, anchorB)
}

func ptrEqual[T comparable](a, b *T) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func describeWindow(resetPeriod *period.ResetPeriod, resetAnchor *period.ResetAnchor) string {
	if resetPeriod == nil || resetAnchor == nil {
		return "a lifetime counter"
	}
	return fmt.Sprintf("resetPeriod %s, resetAnchor %s", *resetPeriod, *resetAnchor)
}
