// Package notifications_test exercises the notification queries against a real
// Postgres.
//
// These queries are where the design's central claim lives -- that a feed with
// per-user read state needs no notification table -- and none of it is provable
// against a stub: the read state is two things ORed in SQL (an individual mark,
// and a watermark), the paging is a keyset comparison, and the compaction that
// keeps notification_read sparse is a DELETE ... USING across two tables.
package notifications_test

import (
	"os"
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
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/listnotifications"
	"github.com/kaitencloud/kaiten/api/tests"
)

var testDb *tests.TestDatabase

func TestMain(m *testing.M) {
	var err error

	testDb, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}

	defer testDb.TearDown()
	os.Exit(m.Run())
}

// tenant gives each test its own organization and user.
//
// Read state is per user and the feed is per organization, so tests that shared
// the seeded pair would see each other's rows -- and the count assertions here
// are exact, which is the point of them.
func tenant(t *testing.T) (organizationID, userID uuid.UUID) {
	t.Helper()

	organizationID, userID = uuid.New(), uuid.New()
	suffix := organizationID.String()

	_, err := testDb.DbPool.Exec(t.Context(),
		`INSERT INTO organization (id, external_id, name) VALUES ($1, $2, 'Notifications Test')`,
		organizationID, "org-"+suffix)
	require.NoError(t, err)

	_, err = testDb.DbPool.Exec(t.Context(),
		`INSERT INTO "user" (id, external_id, email, name) VALUES ($1, $2, $3, 'Notifications Test User')`,
		userID, "user-"+suffix, "notifications-"+suffix+"@example.com")
	require.NoError(t, err)

	_, err = testDb.DbPool.Exec(t.Context(),
		`INSERT INTO user_on_organization (organization_id, user_id) VALUES ($1, $2)`,
		organizationID, userID)
	require.NoError(t, err)

	return organizationID, userID
}

func queries(t *testing.T) *db.Queries {
	t.Helper()

	return db.New(testDb.DbPool)
}

// insertAuditEntry writes one audit trail row, which is what a notification is.
func insertAuditEntry(t *testing.T, orgID uuid.UUID, eventName string, occurredAt time.Time) uuid.UUID {
	t.Helper()

	var id uuid.UUID
	err := testDb.DbPool.QueryRow(t.Context(),
		`INSERT INTO audit_trail (organization_id, event_name, event_type, occurred_at, payload)
		 VALUES ($1, $2, 'com.kaiten.test.v1.happened', $3, '{"name":"Acme Production","slug":"acme-prod"}'::jsonb)
		 RETURNING id`,
		orgID, eventName, occurredAt).Scan(&id)
	require.NoError(t, err)

	return id
}

func timestamptz(at time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: at.UTC(), Valid: true}
}

func listParams(userID, orgID uuid.UUID) db.ListNotificationsParams {
	return db.ListNotificationsParams{
		UserID:           userID,
		OrganizationID:   orgID,
		EventNames:       []string{instanceevents.InstanceDeployed.Name},
		WindowStart:      timestamptz(time.Now().Add(-feed.Window)),
		CursorOccurredAt: pgtype.Timestamptz{},
		CursorID:         nil,
		UnreadOnly:       false,
		LimitPlusOne:     50,
	}
}

func countParams(userID, orgID uuid.UUID) db.CountUnreadNotificationsParams {
	return db.CountUnreadNotificationsParams{
		UserID:         userID,
		OrganizationID: orgID,
		EventNames:     []string{instanceevents.InstanceDeployed.Name},
		WindowStart:    timestamptz(time.Now().Add(-feed.Window)),
		MaxCount:       feed.MaxUnreadCount,
	}
}

func TestTheFeedIsScopedToTheOrganizationAndTheSubscribedEvents(t *testing.T) {
	orgID, userID := tenant(t)
	now := time.Now()

	wanted := insertAuditEntry(t, orgID, instanceevents.InstanceDeployed.Name, now)
	insertAuditEntry(t, orgID, instanceevents.EntitlementValueGet.Name, now)

	rows, err := queries(t).ListNotifications(t.Context(), listParams(userID, orgID))
	require.NoError(t, err)

	// The high-volume event is in the audit trail and must not be in the feed:
	// this filter is what makes a shared table usable as a notification feed.
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	assert.Contains(t, ids, wanted)
	for _, row := range rows {
		assert.Equal(t, instanceevents.InstanceDeployed.Name, row.EventName)
	}
}

func TestMarkingOneNotificationReadLeavesTheOthersAlone(t *testing.T) {
	orgID, userID := tenant(t)
	q := queries(t)
	now := time.Now()

	read := insertAuditEntry(t, orgID, instanceevents.InstanceDeployed.Name, now)
	unread := insertAuditEntry(t, orgID, instanceevents.InstanceDeployed.Name, now)

	affected, err := q.MarkNotificationsRead(t.Context(), db.MarkNotificationsReadParams{
		UserID: userID, OrganizationID: orgID, Ids: []uuid.UUID{read},
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), affected)

	rows, err := q.ListNotifications(t.Context(), listParams(userID, orgID))
	require.NoError(t, err)

	states := map[uuid.UUID]bool{}
	for _, row := range rows {
		require.NotNil(t, row.Read)
		states[row.ID] = *row.Read
	}
	assert.True(t, states[read])
	assert.False(t, states[unread])
}

func TestMarkingAnotherOrganizationsNotificationMarksNothing(t *testing.T) {
	orgID, userID := tenant(t)

	// The join against audit_trail is the authorization check. It answers 0 rows
	// rather than an error, which is also what makes a client's retry of a
	// partially applied page safe.
	affected, err := queries(t).MarkNotificationsRead(t.Context(), db.MarkNotificationsReadParams{
		UserID: userID, OrganizationID: orgID, Ids: []uuid.UUID{uuid.New()},
	})
	require.NoError(t, err)

	assert.Zero(t, affected)
}

func TestMarkAllReadUsesTheWatermarkAndCompactsTheRows(t *testing.T) {
	orgID, userID := tenant(t)
	q := queries(t)
	now := time.Now()

	old := insertAuditEntry(t, orgID, instanceevents.InstanceDeployed.Name, now.Add(-time.Hour))
	_, err := q.MarkNotificationsRead(t.Context(), db.MarkNotificationsReadParams{
		UserID: userID, OrganizationID: orgID, Ids: []uuid.UUID{old},
	})
	require.NoError(t, err)

	watermark := time.Now()
	require.NoError(t, q.MarkAllNotificationsRead(t.Context(), db.MarkAllNotificationsReadParams{
		UserID: userID, ReadAllBefore: timestamptz(watermark),
	}))
	require.NoError(t, q.CompactNotificationReads(t.Context(), db.CompactNotificationReadsParams{
		UserID: userID, ReadAllBefore: timestamptz(watermark),
	}))

	unread, err := q.CountUnreadNotifications(t.Context(), countParams(userID, orgID))
	require.NoError(t, err)
	assert.Zero(t, unread, "everything before the watermark is read")

	// The individual mark is gone, and the row still reads as read -- which is
	// the claim that lets "mark all read" be one UPDATE instead of one row per
	// notification per user.
	var marks int
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT count(*) FROM notification_read WHERE user_id = $1`, userID).Scan(&marks))
	assert.Zero(t, marks)

	rows, err := q.ListNotifications(t.Context(), listParams(userID, orgID))
	require.NoError(t, err)
	for _, row := range rows {
		require.NotNil(t, row.Read)
		assert.True(t, *row.Read)
	}

	// And something that happens after it is unread again.
	insertAuditEntry(t, orgID, instanceevents.InstanceDeployed.Name, time.Now().Add(time.Second))

	unread, err = q.CountUnreadNotifications(t.Context(), countParams(userID, orgID))
	require.NoError(t, err)
	assert.Equal(t, int64(1), unread)
}

func TestTheUnreadFilterAndTheCountAgree(t *testing.T) {
	orgID, userID := tenant(t)
	q := queries(t)

	require.NoError(t, q.MarkAllNotificationsRead(t.Context(), db.MarkAllNotificationsReadParams{
		UserID: userID, ReadAllBefore: timestamptz(time.Now()),
	}))

	for range 3 {
		insertAuditEntry(t, orgID, instanceevents.InstanceDeployed.Name, time.Now().Add(time.Second))
	}

	params := listParams(userID, orgID)
	params.UnreadOnly = true
	rows, err := q.ListNotifications(t.Context(), params)
	require.NoError(t, err)

	unread, err := q.CountUnreadNotifications(t.Context(), countParams(userID, orgID))
	require.NoError(t, err)

	// The badge and the "unread" tab are two readings of one predicate; a
	// disagreement between them is the bug this pins.
	assert.Equal(t, len(rows), int(unread))
	assert.Equal(t, 3, len(rows))
}

func TestKeysetPagingReturnsEachRowOnce(t *testing.T) {
	orgID, userID := tenant(t)
	q := queries(t)

	base := time.Now()
	for i := range 5 {
		insertAuditEntry(t, orgID, instanceevents.InstanceDeployed.Name, base.Add(time.Duration(i)*time.Second))
	}

	seen := map[uuid.UUID]int{}
	params := listParams(userID, orgID)
	params.LimitPlusOne = 3 // two per page, plus the lookahead row

	for range 10 {
		rows, err := q.ListNotifications(t.Context(), params)
		require.NoError(t, err)
		if len(rows) == 0 {
			break
		}

		page := rows
		if len(page) > 2 {
			page = page[:2]
		}
		for _, row := range page {
			seen[row.ID]++
		}

		if len(rows) <= 2 {
			break
		}

		last := page[len(page)-1]
		params.CursorOccurredAt = last.OccurredAt
		params.CursorID = &last.ID
	}

	require.GreaterOrEqual(t, len(seen), 5)
	for id, count := range seen {
		assert.Equal(t, 1, count, "notification %s was returned on more than one page", id)
	}
}

func TestPreferencesRoundTrip(t *testing.T) {
	_, userID := tenant(t)
	q := queries(t)

	require.NoError(t, q.UpsertNotificationPreference(t.Context(), db.UpsertNotificationPreferenceParams{
		UserID: userID, EventName: instanceevents.InstanceDeployed.Name, Channel: "in_app", Enabled: false,
	}))

	rows, err := q.ListNotificationPreferences(t.Context(), userID)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.False(t, rows[0].Enabled)

	// Upsert is what a second change on the same row does; it must not conflict.
	require.NoError(t, q.UpsertNotificationPreference(t.Context(), db.UpsertNotificationPreferenceParams{
		UserID: userID, EventName: instanceevents.InstanceDeployed.Name, Channel: "in_app", Enabled: true,
	}))

	rows, err = q.ListNotificationPreferences(t.Context(), userID)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.True(t, rows[0].Enabled)

	require.NoError(t, q.DeleteNotificationPreferences(t.Context(), db.DeleteNotificationPreferencesParams{
		UserID: userID, EventNames: []string{instanceevents.InstanceDeployed.Name}, Channel: "in_app",
	}))

	rows, err = q.ListNotificationPreferences(t.Context(), userID)
	require.NoError(t, err)
	assert.Empty(t, rows)
}

// objects creates, in one organization, the instance, zone and release a
// notification can be about, and returns their ids. Every slug carries the
// organization's id so tests never collide on a unique slug.
func objects(t *testing.T, orgID, userID uuid.UUID) (instanceID, zoneID, releaseID uuid.UUID) {
	t.Helper()

	suffix := orgID.String()[:8]
	ctx := t.Context()

	var customerID, familyID, licenseID uuid.UUID
	require.NoError(t, testDb.DbPool.QueryRow(ctx,
		`INSERT INTO customer (name, slug, created_by_id, updated_by_id, organization_id)
		 VALUES ('Acme', $1, $2, $2, $3) RETURNING id`,
		"acme-"+suffix, userID, orgID).Scan(&customerID))
	// since the license-family split a license is a version of a family: family_id and
	// lifecycle_state are both not nullable, the family comes first, and the
	// trigger numbers the version.
	require.NoError(t, testDb.DbPool.QueryRow(ctx,
		`INSERT INTO license_family (slug, organization_id) VALUES ($1, $2) RETURNING id`,
		"premium-"+suffix, orgID).Scan(&familyID))
	require.NoError(t, testDb.DbPool.QueryRow(ctx,
		`INSERT INTO license (name, slug, description, type, lifecycle_state, organization_id, family_id)
		 VALUES ('Premium', $1, '', 'PAID', 'PUBLISHED', $2, $3) RETURNING id`,
		"premium-"+suffix, orgID, familyID).Scan(&licenseID))
	require.NoError(t, testDb.DbPool.QueryRow(ctx,
		`INSERT INTO instance (name, slug, description, customer_id, license_id, created_by_id, updated_by_id, organization_id)
		 VALUES ('Acme Production', $1, '', $2, $3, $4, $4, $5) RETURNING id`,
		"acme-prod-"+suffix, customerID, licenseID, userID, orgID).Scan(&instanceID))
	require.NoError(t, testDb.DbPool.QueryRow(ctx,
		`INSERT INTO deployment_zone (name, slug, type, description, created_by_id, updated_by_id, organization_id)
		 VALUES ('Europe', $1, 'production', '', $2, $2, $3) RETURNING id`,
		"eu-"+suffix, userID, orgID).Scan(&zoneID))
	require.NoError(t, testDb.DbPool.QueryRow(ctx,
		`INSERT INTO release (version, slug, created_by_id, organization_id)
		 VALUES ('1.0.0', $1, $2, $3) RETURNING id`,
		"1-0-0-"+suffix, userID, orgID).Scan(&releaseID))

	return instanceID, zoneID, releaseID
}

// insertNotification writes one audit trail row the way a producer does: the
// instance in its own column, everything else in the payload.
func insertNotification(t *testing.T, orgID uuid.UUID, instanceID *uuid.UUID, eventName, payload string) {
	t.Helper()

	_, err := testDb.DbPool.Exec(t.Context(),
		`INSERT INTO audit_trail (organization_id, instance_id, event_name, event_type, occurred_at, payload)
		 VALUES ($1, $2, $3, 'com.kaiten.test.v1.happened', now(), $4::jsonb)`,
		orgID, instanceID, eventName, payload)
	require.NoError(t, err)
}

func TestTheFeedOpensWhatEachNotificationIsAbout(t *testing.T) {
	orgID, userID := tenant(t)
	instanceID, zoneID, releaseID := objects(t, orgID, userID)
	suffix := orgID.String()[:8]

	// Another organization's zone, named by id in this organization's payload.
	// Resolution is scoped like every other read here, so it must not answer.
	otherOrgID, otherUserID := tenant(t)
	_, foreignZoneID, _ := objects(t, otherOrgID, otherUserID)

	insertNotification(t, orgID, &instanceID, instanceevents.InstanceDeployed.Name,
		`{"name":"Acme Production","slug":"renamed-since","customerSlug":"acme"}`)
	insertNotification(t, orgID, nil, instanceevents.InstanceCreated.Name,
		`{"name":"Gone Production","slug":"gone-prod","customerSlug":"acme-`+suffix+`"}`)
	insertNotification(t, orgID, nil, deploymentzoneevents.ReleaseDeployed.Name,
		`{"deploymentZoneId":"`+zoneID.String()+`","releaseId":"`+releaseID.String()+`"}`)
	insertNotification(t, orgID, nil, deploymentzoneevents.ReleaseDeployed.Name,
		`{"deploymentZoneId":"`+foreignZoneID.String()+`","releaseId":"not-an-id"}`)

	list, err := feed.List(t.Context(), queries(t), feed.Query{
		UserID:         userID,
		OrganizationID: orgID,
		Subscription: feed.Subscription{
			instanceevents.InstanceDeployed.Name,
			instanceevents.InstanceCreated.Name,
			deploymentzoneevents.ReleaseDeployed.Name,
		},
		UnreadOnly: false,
		Limit:      feed.MaxLimit,
		Cursor:     "",
	})
	require.NoError(t, err)

	opens := map[string]string{}
	for _, notification := range list.Data {
		require.NotNil(t, notification.ActionURL, "%q links nowhere", notification.Title)
		opens[notification.Title] = *notification.ActionURL
	}

	assert.Equal(t, map[string]string{
		// The instance's slug as it is now, not the one the payload recorded.
		"Acme Production was deployed": "/customers/instances/acme-prod-" + suffix,
		// instance_id is NULL once the instance is deleted: its customer is what
		// is left to open.
		"Gone Production was created": "/customers/acme-" + suffix,
		// A deployment's payload is nothing but ids.
		"Release 1.0.0 was deployed to Europe": "/releases/deployment-zones/eu-" + suffix,
		// A zone of another organization, and a release id that is not one: both
		// unresolved, so the notification opens the zone list.
		"A release was deployed to a deployment zone": "/releases/deployment-zones",
	}, opens)
}

func TestTheObjectTypeFilterNarrowsThePageAndItsUnreadCount(t *testing.T) {
	orgID, userID := tenant(t)
	instanceID, zoneID, releaseID := objects(t, orgID, userID)

	insertNotification(t, orgID, &instanceID, instanceevents.InstanceDeployed.Name,
		`{"name":"Acme Production"}`)
	insertNotification(t, orgID, nil, deploymentzoneevents.ReleaseDeployed.Name,
		`{"deploymentZoneId":"`+zoneID.String()+`","releaseId":"`+releaseID.String()+`"}`)

	list, err := listnotifications.NewUseCase(queries(t)).Execute(t.Context(), userID, orgID, listnotifications.Query{
		UnreadOnly: false,
		Objects:    []catalogue.Object{catalogue.ObjectDeploymentZone},
		Limit:      feed.MaxLimit,
		Cursor:     "",
	})
	require.NoError(t, err)

	require.Len(t, list.Data, 1)
	assert.Equal(t, string(catalogue.ObjectDeploymentZone), list.Data[0].ObjectType)
	assert.Equal(t, "Release 1.0.0 was deployed to Europe", list.Data[0].Title)
	// The count travels with the page, so it has to describe the same rows: an
	// "Unread (2)" over a one-row filtered list would be a lie.
	assert.Equal(t, 1, list.UnreadCount)
}
