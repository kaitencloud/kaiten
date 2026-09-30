package catalogue_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
)

// TestNotifiableEventsAreRealEvents is the guarantee Register enforces at init,
// asserted here as well so the reason is written down: an event name that is not
// in the published vocabulary is a notification nothing will ever emit, and it
// would sit in the settings page as a toggle that does nothing.
func TestNotifiableEventsAreRealEvents(t *testing.T) {
	t.Parallel()

	published := map[string]string{}
	for _, event := range events.Catalogue() {
		published[event.Name] = event.Type
	}

	for _, entry := range catalogue.All() {
		eventType, ok := published[entry.Event.Name]
		require.True(t, ok, "%s is notifiable but not a published event", entry.Event.Name)
		assert.Equal(t, eventType, entry.Event.Type,
			"%s carries a type the contract does not publish", entry.Event.Name)
	}
}

// TestHighVolumeEventsAreNotNotifiable pins the three events that must never
// reach a bell. Each one fires per request or per report rather than per
// decision -- ENTITLEMENT_VALUE_GET fires on every entitlement read, and
// FEATURE_FLAG_EVALUATED on every flag evaluation -- so registering one would
// not merely be noisy: it would bury every other notification and make the
// unread count meaningless within minutes.
func TestHighVolumeEventsAreNotNotifiable(t *testing.T) {
	t.Parallel()

	for _, eventName := range []string{
		"FEATURE_FLAG_EVALUATED",
		"ENTITLEMENT_VALUE_GET",
		"ENTITLEMENT_USAGE_REPORT_ACCEPTED",
	} {
		assert.False(t, catalogue.Notifiable(eventName),
			"%s fires per request or per report and must stay out of the feed", eventName)
	}
}

func TestEveryEntryCanRenderSomethingReadable(t *testing.T) {
	t.Parallel()

	// Payloads this renderer has never seen are the normal case for old rows,
	// so every entry has to answer with a title rather than an empty card --
	// whether or not the objects the row names could be resolved.
	resolved := catalogue.Refs{
		Instance:       &catalogue.Ref{Slug: "acme-prod", Name: "Acme Production"},
		DeploymentZone: &catalogue.Ref{Slug: "eu", Name: "Europe"},
		Release:        &catalogue.Ref{Slug: "v1-0-0", Name: "1.0.0"},
		License:        &catalogue.Ref{Slug: "premium-1a2b3c", Name: "Premium"},
	}
	for _, refs := range []catalogue.Refs{{}, resolved} {
		for _, payload := range [][]byte{nil, []byte(`{}`), []byte(`{"unexpected":"shape"}`), []byte(`not json`)} {
			for _, entry := range catalogue.All() {
				rendered := entry.Render(payload, refs)
				assert.NotEmpty(t, rendered.Title, "%s rendered no title", entry.Event.Name)
				assert.NotEmpty(t, rendered.ActionURL, "%s links nowhere", entry.Event.Name)
			}
		}
	}
}

func TestEveryEntryIsGroupedAndLabelled(t *testing.T) {
	t.Parallel()

	groups := map[string]bool{
		catalogue.GroupDeployments: true,
		catalogue.GroupInstances:   true,
		catalogue.GroupUsage:       true,
		catalogue.GroupCustomers:   true,
		catalogue.GroupLicensing:   true,
		catalogue.GroupSecurity:    true,
	}

	for _, entry := range catalogue.All() {
		assert.NotEmpty(t, entry.Label, "%s has no label", entry.Event.Name)
		assert.True(t, groups[entry.Group],
			"%s is in group %q, which the settings page has no heading for",
			entry.Event.Name, entry.Group)
	}
}

// TestEveryObjectTheFilterOffersHasAnEvent keeps the filter honest: an object
// with no notifiable event is an option that can only ever answer "nothing".
func TestEveryObjectTheFilterOffersHasAnEvent(t *testing.T) {
	t.Parallel()

	about := map[catalogue.Object]int{}
	for _, entry := range catalogue.All() {
		about[entry.Object]++
	}

	for _, object := range catalogue.Objects {
		assert.Positive(t, about[object], "the filter offers %q, which no notifiable event is about", object)
	}
}
