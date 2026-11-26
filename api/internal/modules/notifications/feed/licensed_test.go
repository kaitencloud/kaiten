package feed_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/feed"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

var (
	nearLimit   = events.InstanceEntitlementUsageWarningThresholdReached.Name
	fullyUsed   = events.InstanceEntitlementUsageReached.Name
	limitHit    = events.InstanceEntitlementCapExceeded.Name
	rejected    = events.EntitlementUsageReportRejected.Name
	subscribed  = feed.Subscription{nearLimit, fullyUsed, limitHit, rejected}
	thresholdOf = map[string]bool{nearLimit: true, fullyUsed: true, limitHit: true}
)

// The three threshold alerts are the entries threshold-alerting gates, and only
// those: a rejected usage report is an operations alarm every plan keeps.
func TestThresholdAlertsRequireThresholdAlerting(t *testing.T) {
	for _, name := range subscribed {
		entry, known := catalogue.Lookup(name)
		assert.True(t, known, name)
		if thresholdOf[name] {
			assert.Equal(t, dogfooding.ThresholdAlertingEntitlementSlug, entry.Capability, name)
		} else {
			assert.Empty(t, entry.Capability, name)
		}
	}
}

func TestLicensedDropsWhatThePlanDoesNotGrant(t *testing.T) {
	org := uuid.New()
	asked := 0
	notGranted := func(_ context.Context, organization uuid.UUID, capability string) bool {
		asked++
		assert.Equal(t, org, organization)
		assert.Equal(t, dogfooding.ThresholdAlertingEntitlementSlug, capability)
		return false
	}

	assert.Equal(t, feed.Subscription{rejected}, subscribed.Licensed(t.Context(), notGranted, org))
	assert.Equal(t, 1, asked, "the plan is asked once per capability, not once per event")
}

func TestLicensedKeepsWhatThePlanGrants(t *testing.T) {
	granted := func(context.Context, uuid.UUID, string) bool { return true }

	assert.Equal(t, subscribed, subscribed.Licensed(t.Context(), granted, uuid.New()))
	assert.Equal(t, subscribed, subscribed.Licensed(t.Context(), nil, uuid.New()), "no licensing withholds nothing")
}
