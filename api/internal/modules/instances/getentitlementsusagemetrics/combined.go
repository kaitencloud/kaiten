package getentitlementsusagemetrics

import (
	"encoding/json"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
)

// WithCombined appends to the usage of what an instance is granted the combined
// entitlements it reads: each the weighted sum of the usage of its sources the
// instance is granted. A combined entitlement is granted to nobody, so it is not
// in the rows MapUsageRows maps; it exists for an instance as soon as one of its
// sources is granted to it, and one whose sources none is gets no row.
//
// The sum is usage.Combine's, and is presented as any other entitlement's usage
// is: its limit is the weighted limit, its overage percent 0 (-1 when unlimited)
// and its source the licence's, whichever layer raised the limit of a source.
// Nothing here is stored, and nothing is enforced on it. MapUsageRows stays the
// rows of what is granted, which is what the over-quota check of a plan change
// reads.
func WithCombined(usages []schema.EntitlementUsage, definitions []catalogue.Combined) ([]schema.EntitlementUsage, error) {
	if len(definitions) == 0 || len(usages) == 0 {
		return usages, nil
	}

	granted := make(map[string]schema.EntitlementUsage, len(usages))
	for _, u := range usages {
		granted[u.EntitlementSlug] = u
	}

	result := usages
	for _, definition := range definitions {
		var (
			sources []usage.CombinedSource
			licence schema.EntitlementUsage
		)
		for _, source := range definition.Sources {
			read, ok := granted[source.Slug]
			if !ok || read.Value.Number == nil {
				continue
			}
			licence = read
			sources = append(sources, usage.CombinedSource{
				Slug:      source.Slug,
				Weight:    source.Weight,
				Counter:   usage.Counter{Value: read.Value.Number.Value, EventCount: read.Value.Number.EventCount},
				Threshold: thresholdOf(read),
				Window:    usage.Window{Start: read.CurrentPeriodStart, End: read.CurrentPeriodEnd},
			})
		}

		combined, found := usage.Combine(sources)
		if !found {
			continue
		}
		read, err := presentCombined(definition.ID, definition.Slug, licence, combined)
		if err != nil {
			return nil, err
		}
		result = append(result, *read)
	}

	return result, nil
}

// thresholdOf is the effective limit a source is read against; 0 for one that
// reads no number, which a granted NUMBER never does.
func thresholdOf(read schema.EntitlementUsage) float64 {
	if read.Limit == nil || read.Limit.Number == nil {
		return 0
	}
	return read.Limit.Number.Value
}

// presentCombined shows a combined entitlement the way every usage is shown, and
// adds the detail of its sum. licence is one of the instance's sources: they all
// answer for the instance's licence version.
func presentCombined(id uuid.UUID, slug string, licence schema.EntitlementUsage, combined usage.Combined) (*schema.EntitlementUsage, error) {
	limit, err := json.Marshal(schema.NumberEntitlementValue{Type: entitlementvalue.TypeNumber, Value: combined.Threshold})
	if err != nil {
		return nil, err
	}

	overage := int16(0)
	if entitlementvalue.IsUnlimitedThreshold(combined.Threshold) {
		overage = int16(entitlementvalue.UnlimitedOveragePercent)
	}

	read, err := usage.Present(usage.Gauge{
		EntitlementID:   id,
		EntitlementSlug: slug,
		LicenseID:       licence.LicenseID,
		LicenseSlug:     licence.LicenseSlug,
		NumberFamily:    true,
		OveragePercent:  &overage,
		Source:          schema.SourceLicense,
		LicenseValue:    limit,
		Counter:         combined.Counter,
		Window:          combined.Window,
	})
	if err != nil {
		return nil, err
	}

	read.Sources = make([]schema.CombinedSourceUsage, 0, len(combined.Parts))
	for _, part := range combined.Parts {
		read.Sources = append(read.Sources, schema.CombinedSourceUsage{
			EntitlementSlug: part.Slug, Weight: part.Weight.String(), Usage: part.Usage, Limit: part.Limit,
		})
	}

	return read, nil
}
