package feed_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	deploymentzoneevents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	instanceevents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/feed"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/infrastructure/db"
)

type stubReader struct {
	rows        []db.ListNotificationsRow
	preferences []db.ListNotificationPreferencesRow
	unread      int64
	one         db.GetNotificationRow

	// What the resolve queries find, by id. An id with no entry is an object
	// that was deleted.
	instances map[uuid.UUID]db.ResolveInstancesRow
	zones     map[uuid.UUID]db.ResolveDeploymentZonesRow
	releases  map[uuid.UUID]db.ResolveReleasesRow
	licenses  map[uuid.UUID]db.ResolveLicensesRow

	lastList  db.ListNotificationsParams
	lastCount db.CountUnreadNotificationsParams
	// resolved records the ids each resolve query was asked for, one entry per
	// call.
	resolved map[string][][]uuid.UUID
}

func (s *stubReader) ListNotifications(_ context.Context, arg db.ListNotificationsParams) ([]db.ListNotificationsRow, error) {
	s.lastList = arg

	return s.rows, nil
}

func (s *stubReader) CountUnreadNotifications(_ context.Context, arg db.CountUnreadNotificationsParams) (int64, error) {
	s.lastCount = arg

	return s.unread, nil
}

func (s *stubReader) GetNotification(_ context.Context, _ db.GetNotificationParams) (db.GetNotificationRow, error) {
	return s.one, nil
}

func (s *stubReader) ListNotificationPreferences(_ context.Context, _ uuid.UUID) ([]db.ListNotificationPreferencesRow, error) {
	return s.preferences, nil
}

func (s *stubReader) ResolveInstances(_ context.Context, arg db.ResolveInstancesParams) ([]db.ResolveInstancesRow, error) {
	return pick(s, "instances", arg.Ids, s.instances), nil
}

func (s *stubReader) ResolveDeploymentZones(_ context.Context, arg db.ResolveDeploymentZonesParams) ([]db.ResolveDeploymentZonesRow, error) {
	return pick(s, "zones", arg.Ids, s.zones), nil
}

func (s *stubReader) ResolveReleases(_ context.Context, arg db.ResolveReleasesParams) ([]db.ResolveReleasesRow, error) {
	return pick(s, "releases", arg.Ids, s.releases), nil
}

func (s *stubReader) ResolveLicenses(_ context.Context, arg db.ResolveLicensesParams) ([]db.ResolveLicensesRow, error) {
	return pick(s, "licenses", arg.Ids, s.licenses), nil
}

func pick[Row any](s *stubReader, kind string, ids []uuid.UUID, known map[uuid.UUID]Row) []Row {
	if s.resolved == nil {
		s.resolved = map[string][][]uuid.UUID{}
	}
	s.resolved[kind] = append(s.resolved[kind], ids)

	var found []Row
	for _, id := range ids {
		if row, ok := known[id]; ok {
			found = append(found, row)
		}
	}

	return found
}

// acmeProd is the instance the rows below are about, as the resolve query finds
// it.
var acmeProd = db.ResolveInstancesRow{ID: uuid.New(), Slug: "acme-prod", Name: "Acme Production"}

func row(id uuid.UUID, eventName string, occurredAt time.Time, read bool) db.ListNotificationsRow {
	return db.ListNotificationsRow{
		ID:         id,
		EventName:  eventName,
		EventType:  instanceevents.InstanceDeployed.Type,
		OccurredAt: pgtype.Timestamptz{Time: occurredAt, Valid: true},
		Payload:    []byte(`{"name":"Acme Production","slug":"acme-prod","deploymentZoneSlug":"eu-north-1"}`),
		InstanceID: &acmeProd.ID,
		Read:       &read,
	}
}

func TestListRendersFromTheCatalogue(t *testing.T) {
	t.Parallel()

	occurredAt := time.Now().Add(-time.Hour).UTC()
	reader := &stubReader{
		rows: []db.ListNotificationsRow{
			row(uuid.New(), instanceevents.InstanceDeployed.Name, occurredAt, false),
		},
		instances: map[uuid.UUID]db.ResolveInstancesRow{acmeProd.ID: acmeProd},
	}

	list, err := feed.List(context.Background(), reader, feed.Query{
		UserID:         uuid.New(),
		OrganizationID: uuid.New(),
		Subscription:   feed.Subscription{instanceevents.InstanceDeployed.Name},
	})
	require.NoError(t, err)

	require.Len(t, list.Data, 1)
	// Rendered from the payload, not stored: this is what lets the wording of a
	// notification change without a backfill.
	assert.Equal(t, "Acme Production was deployed", list.Data[0].Title)
	require.NotNil(t, list.Data[0].Body)
	assert.Equal(t, "Deployed to eu-north-1", *list.Data[0].Body)
	require.NotNil(t, list.Data[0].ActionURL)
	assert.Equal(t, "/customers/instances/acme-prod", *list.Data[0].ActionURL,
		"the link is an app route, not an API path: instances live under /customers in the UI")
	assert.Nil(t, list.Data[0].ReadAt, "an unread row must not carry a read timestamp")

	// The CloudEvents type travels with every notification: it is the key the
	// OpenAPI document publishes each event's webhook and payload schema under,
	// so a client can join a notification to the contract rather than to a
	// hand-kept list of names.
	assert.Equal(t, instanceevents.InstanceDeployed.Type, list.Data[0].EventType)
}

func TestListSurvivesAPayloadItDoesNotRecognize(t *testing.T) {
	t.Parallel()

	// The regression this guards: a renderer reads an audit trail payload written
	// by whatever version of the producer was running at the time, possibly months
	// ago. A renderer that insists on a field turns an old row into a 500 for the
	// whole page.
	reader := &stubReader{rows: []db.ListNotificationsRow{{
		ID:         uuid.New(),
		EventName:  instanceevents.InstanceDeployed.Name,
		OccurredAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
		Payload:    []byte(`{"unexpected":"shape"}`),
	}}}

	list, err := feed.List(context.Background(), reader, feed.Query{
		Subscription: feed.Subscription{instanceevents.InstanceDeployed.Name},
	})
	require.NoError(t, err)

	require.Len(t, list.Data, 1)
	assert.NotEmpty(t, list.Data[0].Title)
}

func TestListPagesWithAnOpaqueCursor(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC()
	first, second := uuid.New(), uuid.New()
	reader := &stubReader{rows: []db.ListNotificationsRow{
		row(first, instanceevents.InstanceDeployed.Name, now, false),
		row(second, instanceevents.InstanceDeployed.Name, now.Add(-time.Minute), false),
	}}

	list, err := feed.List(context.Background(), reader, feed.Query{
		Subscription: feed.Subscription{instanceevents.InstanceDeployed.Name},
		Limit:        1,
	})
	require.NoError(t, err)

	// One row asked for, two fetched: the extra row is how the query answers
	// "is there another page" without a second COUNT.
	assert.Equal(t, int32(2), reader.lastList.LimitPlusOne)
	require.Len(t, list.Data, 1)
	require.NotNil(t, list.NextCursor)

	// The cursor round-trips to the keyset of the last row returned, so the next
	// page starts strictly after it rather than repeating it.
	occurredAt, id, err := feed.DecodeCursor(*list.NextCursor)
	require.NoError(t, err)
	require.NotNil(t, id)
	assert.Equal(t, first, *id)
	assert.WithinDuration(t, now, occurredAt.Time, time.Microsecond)
}

func TestListRejectsACursorItDidNotIssue(t *testing.T) {
	t.Parallel()

	// Paging from the top instead would silently repeat rows the client already
	// rendered, which reads as duplicate notifications rather than as an error.
	_, err := feed.List(context.Background(), &stubReader{}, feed.Query{
		Subscription: feed.Subscription{instanceevents.InstanceDeployed.Name},
		Cursor:       "not-a-cursor",
	})
	require.Error(t, err)
}

func TestAnEmptySubscriptionAsksTheDatabaseNothing(t *testing.T) {
	t.Parallel()

	reader := &stubReader{}

	list, err := feed.List(context.Background(), reader, feed.Query{Subscription: nil})
	require.NoError(t, err)

	assert.Empty(t, list.Data)
	assert.Zero(t, list.UnreadCount)
	assert.Empty(t, reader.lastList.EventNames, "a known-empty feed should not cost a round trip")
}

func TestUnreadCountIsCapped(t *testing.T) {
	t.Parallel()

	reader := &stubReader{unread: feed.MaxUnreadCount}

	count, err := feed.Unread(context.Background(), reader, uuid.New(), uuid.New(),
		feed.Subscription{instanceevents.InstanceDeployed.Name})
	require.NoError(t, err)

	assert.Equal(t, feed.MaxUnreadCount, count)
	assert.Equal(t, int32(feed.MaxUnreadCount), reader.lastCount.MaxCount,
		"the cap is pushed into the query, not applied after counting everything")
}

func TestSubscriptionIsDefaultsOverlaidWithOverrides(t *testing.T) {
	t.Parallel()

	// InstanceStatusChanged is off by default; an override turns it on. Resolving
	// this per read rather than storing it is what lets a default change reach
	// users who already opened the settings page.
	reader := &stubReader{preferences: []db.ListNotificationPreferencesRow{
		{EventName: instanceevents.InstanceStatusChanged.Name, Channel: string(catalogue.ChannelInApp), Enabled: true},
		{EventName: instanceevents.InstanceDeployed.Name, Channel: string(catalogue.ChannelInApp), Enabled: false},
	}}

	subscription, err := feed.SubscriptionFor(context.Background(), reader, uuid.New(), catalogue.ChannelInApp)
	require.NoError(t, err)

	assert.True(t, subscription.Subscribed(instanceevents.InstanceStatusChanged.Name))
	assert.False(t, subscription.Subscribed(instanceevents.InstanceDeployed.Name))
	assert.True(t, subscription.Subscribed(instanceevents.InstanceCreated.Name), "an event with no override keeps its default")
}

func TestAnOverrideForAForgottenEventIsIgnored(t *testing.T) {
	t.Parallel()

	// Preference rows outlive the deploy that removes an event from the
	// catalogue, and the feed query would reject an unknown name.
	reader := &stubReader{preferences: []db.ListNotificationPreferencesRow{
		{EventName: "EVENT_THAT_NO_LONGER_EXISTS", Channel: string(catalogue.ChannelInApp), Enabled: true},
	}}

	subscription, err := feed.SubscriptionFor(context.Background(), reader, uuid.New(), catalogue.ChannelInApp)
	require.NoError(t, err)

	assert.False(t, subscription.Subscribed("EVENT_THAT_NO_LONGER_EXISTS"))
}

func TestListLinksToTheSlugAnObjectHasNow(t *testing.T) {
	t.Parallel()

	// The payload recorded the slug the instance had when the event fired; the
	// link has to use the one it has now, or a renamed instance's notifications
	// all open a page that does not exist.
	renamed := db.ResolveInstancesRow{ID: acmeProd.ID, Slug: "acme-production", Name: "Acme Production"}
	reader := &stubReader{
		rows:      []db.ListNotificationsRow{row(uuid.New(), instanceevents.InstanceDeployed.Name, time.Now(), false)},
		instances: map[uuid.UUID]db.ResolveInstancesRow{renamed.ID: renamed},
	}

	list, err := feed.List(context.Background(), reader, feed.Query{
		Subscription: feed.Subscription{instanceevents.InstanceDeployed.Name},
	})
	require.NoError(t, err)

	require.Len(t, list.Data, 1)
	require.NotNil(t, list.Data[0].ActionURL)
	assert.Equal(t, "/customers/instances/acme-production", *list.Data[0].ActionURL)
}

func TestListLinksADeletedInstanceToItsCustomer(t *testing.T) {
	t.Parallel()

	// audit_trail.instance_id is set to NULL when the instance is deleted, so the
	// row names no instance any more. Its page is gone; its customer's is not.
	deleted := row(uuid.New(), instanceevents.InstanceCreated.Name, time.Now(), false)
	deleted.InstanceID = nil
	deleted.Payload = []byte(`{"name":"Acme Production","slug":"acme-prod","customerSlug":"acme"}`)
	reader := &stubReader{rows: []db.ListNotificationsRow{deleted}}

	list, err := feed.List(context.Background(), reader, feed.Query{
		Subscription: feed.Subscription{instanceevents.InstanceCreated.Name},
	})
	require.NoError(t, err)

	require.Len(t, list.Data, 1)
	assert.Equal(t, "Acme Production was created", list.Data[0].Title)
	require.NotNil(t, list.Data[0].ActionURL)
	assert.Equal(t, "/customers/acme", *list.Data[0].ActionURL)
}

func TestListResolvesWhatAPayloadOnlyNamesByID(t *testing.T) {
	t.Parallel()

	// The regression this guards: a deployment's payload is {id,
	// deploymentZoneId, releaseId} and nothing else, so rendering it from the
	// payload alone read "A release was deployed to An item" and opened the zone
	// list instead of the zone.
	zone := db.ResolveDeploymentZonesRow{ID: uuid.New(), Slug: "shared-eu", Name: "Shared EU"}
	release := db.ResolveReleasesRow{ID: uuid.New(), Slug: "2026-8-0-09480a", Version: "2026.8.0"}
	deployed := row(uuid.New(), deploymentzoneevents.ReleaseDeployed.Name, time.Now(), false)
	deployed.InstanceID = nil
	deployed.Payload = []byte(`{"id":"` + uuid.NewString() + `","deploymentZoneId":"` + zone.ID.String() +
		`","releaseId":"` + release.ID.String() + `"}`)
	reader := &stubReader{
		rows:     []db.ListNotificationsRow{deployed},
		zones:    map[uuid.UUID]db.ResolveDeploymentZonesRow{zone.ID: zone},
		releases: map[uuid.UUID]db.ResolveReleasesRow{release.ID: release},
	}

	list, err := feed.List(context.Background(), reader, feed.Query{
		Subscription: feed.Subscription{deploymentzoneevents.ReleaseDeployed.Name},
	})
	require.NoError(t, err)

	require.Len(t, list.Data, 1)
	assert.Equal(t, "Release 2026.8.0 was deployed to Shared EU", list.Data[0].Title)
	require.NotNil(t, list.Data[0].ActionURL)
	assert.Equal(t, "/releases/deployment-zones/shared-eu", *list.Data[0].ActionURL)
}

func TestListResolvesEachKindOnceAPage(t *testing.T) {
	t.Parallel()

	// One query per kind of object a page names, not one per row: the page is at
	// most MaxLimit rows, and every one of them may name an instance.
	other := db.ResolveInstancesRow{ID: uuid.New(), Slug: "globex-prod", Name: "Globex Production"}
	otherRow := row(uuid.New(), instanceevents.InstanceDeployed.Name, time.Now(), false)
	otherRow.InstanceID = &other.ID
	reader := &stubReader{
		rows: []db.ListNotificationsRow{
			row(uuid.New(), instanceevents.InstanceDeployed.Name, time.Now(), false),
			row(uuid.New(), instanceevents.InstanceDeployed.Name, time.Now(), false),
			otherRow,
		},
		instances: map[uuid.UUID]db.ResolveInstancesRow{acmeProd.ID: acmeProd, other.ID: other},
	}

	_, err := feed.List(context.Background(), reader, feed.Query{
		Subscription: feed.Subscription{instanceevents.InstanceDeployed.Name},
	})
	require.NoError(t, err)

	require.Len(t, reader.resolved["instances"], 1, "one instance query for the whole page")
	assert.ElementsMatch(t, []uuid.UUID{acmeProd.ID, other.ID}, reader.resolved["instances"][0],
		"each instance is asked for once, however many rows name it")
	assert.Empty(t, reader.resolved["zones"], "a page that names no zone costs no zone query")
	assert.Empty(t, reader.resolved["releases"])
	assert.Empty(t, reader.resolved["licenses"])
}

func TestOneResolvesLikeTheList(t *testing.T) {
	t.Parallel()

	// The stream pushes a rendered row down an open connection; it has to open
	// the same page the same row opens in the list.
	notificationID := uuid.New()
	reader := &stubReader{
		one: db.GetNotificationRow{
			ID:         notificationID,
			EventName:  instanceevents.InstanceEntitlementUsageReached.Name,
			EventType:  instanceevents.InstanceEntitlementUsageReached.Type,
			OccurredAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
			Payload:    []byte(`{"entitlementSlug":"menu-items"}`),
			InstanceID: &acmeProd.ID,
		},
		instances: map[uuid.UUID]db.ResolveInstancesRow{acmeProd.ID: acmeProd},
	}

	notification, visible, err := feed.One(context.Background(), reader, uuid.New(), uuid.New(), notificationID)
	require.NoError(t, err)
	require.True(t, visible)

	assert.Equal(t, "Acme Production has used all of its menu-items", notification.Title)
	require.NotNil(t, notification.ActionURL)
	assert.Equal(t, "/customers/instances/acme-prod/entitlements", *notification.ActionURL)
}

func TestAboutNarrowsASubscriptionToItsObjects(t *testing.T) {
	t.Parallel()

	subscription := feed.Subscription{
		instanceevents.InstanceDeployed.Name,
		instanceevents.InstanceEntitlementUsageReached.Name,
		deploymentzoneevents.ReleaseDeployed.Name,
	}

	// A usage event is about an instance even though the settings page files it
	// under usage: the filter follows what the notification opens.
	assert.Equal(t,
		feed.Subscription{instanceevents.InstanceDeployed.Name, instanceevents.InstanceEntitlementUsageReached.Name},
		subscription.About([]catalogue.Object{catalogue.ObjectInstance}))
	assert.Equal(t, subscription, subscription.About(nil), "no objects means no filter")
	assert.Empty(t, subscription.About([]catalogue.Object{catalogue.ObjectToken}),
		"an object the user receives nothing about narrows to nothing, which List answers without a query")
}

func TestListTellsWhatEachNotificationIsAbout(t *testing.T) {
	t.Parallel()

	reader := &stubReader{
		rows:      []db.ListNotificationsRow{row(uuid.New(), instanceevents.InstanceDeployed.Name, time.Now(), false)},
		instances: map[uuid.UUID]db.ResolveInstancesRow{acmeProd.ID: acmeProd},
	}

	list, err := feed.List(context.Background(), reader, feed.Query{
		Subscription: feed.Subscription{instanceevents.InstanceDeployed.Name},
	})
	require.NoError(t, err)

	require.Len(t, list.Data, 1)
	assert.Equal(t, string(catalogue.ObjectInstance), list.Data[0].ObjectType)
}
