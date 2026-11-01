package getinstance

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type queryStub struct {
	instance        db.GetOneInstanceRow
	now             pgtype.Timestamp
	lookupErr       error
	clockErr        error
	integrationErr  error
	integrations    []db.GetInstanceIntegrationsRow
	lookups, clocks int
	params          db.GetOneInstanceParams
}

func (q *queryStub) GetOneInstance(_ context.Context, params db.GetOneInstanceParams) (db.GetOneInstanceRow, error) {
	q.lookups++
	q.params = params
	return q.instance, q.lookupErr
}

func (q *queryStub) GetDatabaseNow(context.Context) (pgtype.Timestamp, error) {
	q.clocks++
	return q.now, q.clockErr
}

func (q *queryStub) GetInstanceIntegrations(context.Context, db.GetInstanceIntegrationsParams) ([]db.GetInstanceIntegrationsRow, error) {
	return q.integrations, q.integrationErr
}

func instanceRow(now time.Time) db.GetOneInstanceRow {
	slug := "starter"
	return db.GetOneInstanceRow{Slug: "ninja-prod", LicenseID: uuid.New(), LicenseSlug: &slug,
		StartLicenseDate: timestamp(now.Add(-time.Hour)), EndLicenseDate: timestamp(now.Add(time.Hour))}
}

func timestamp(t time.Time) pgtype.Timestamp { return pgtype.Timestamp{Time: t, Valid: true} }

func TestAssignedLicenseTermBoundaries(t *testing.T) {
	zone := time.FixedZone("UTC+9", 9*60*60)
	start := time.Date(2026, 10, 30, 9, 0, 0, 0, zone)
	end := start.Add(time.Hour)
	for _, tc := range []struct {
		name   string
		now    time.Time
		status schema.LicenseTermStatus
	}{
		{"before start", start.Add(-time.Millisecond), schema.LicenseTermNotStarted},
		{"at start inclusive", start, schema.LicenseTermActive},
		{"inside term", start.Add(time.Minute), schema.LicenseTermActive},
		{"before end", end.Add(-time.Millisecond), schema.LicenseTermActive},
		{"at end exclusive", end, schema.LicenseTermExpired},
		{"after end", end.Add(time.Millisecond), schema.LicenseTermExpired},
	} {
		t.Run(tc.name, func(t *testing.T) {
			orgID, licenseID := uuid.New(), uuid.New()
			slug := "starter"
			q := &queryStub{
				instance: db.GetOneInstanceRow{
					Slug: "ninja-prod", LicenseID: licenseID, LicenseSlug: &slug,
					StartLicenseDate: timestamp(start), EndLicenseDate: timestamp(end),
				},
				now: timestamp(tc.now),
			}
			uc := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{OrganizationID: orgID}})
			actual, err := uc.Execute(t.Context(), "ninja-prod")
			require.NoError(t, err)
			require.NotNil(t, actual.LicenseTerm)
			require.Equal(t, tc.status, actual.LicenseTerm.Status)
			require.Equal(t, 1, q.lookups)
			require.Equal(t, 1, q.clocks)
			require.Equal(t, orgID, q.params.OrganizationID)
			require.Equal(t, "ninja-prod", q.params.Slug)
			require.Equal(t, licenseID, actual.LicenseID)
			require.Equal(t, slug, actual.LicenseSlug)
			require.Equal(t, time.UTC, actual.LicenseTerm.EvaluatedAt.Location())
			require.Equal(t, start.UTC(), actual.StartLicenseDate)
			require.Equal(t, end.UTC(), actual.EndLicenseDate)
		})
	}
}

func TestInstanceTermDoesNotTurnOperationalSignalsIntoSuspension(t *testing.T) {
	now := time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC)
	churned, licenseSlug := "CHURNED", "starter"
	q := &queryStub{instance: db.GetOneInstanceRow{
		Slug: "ninja-prod", LicenseID: uuid.New(), LicenseSlug: &licenseSlug,
		Status: db.InstanceStatusMAINTENANCE, LifecycleStage: &churned,
		StartLicenseDate: timestamp(now.Add(-time.Hour)), EndLicenseDate: timestamp(now.Add(time.Hour)),
	}, now: timestamp(now)}
	actual, err := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{}}).Execute(t.Context(), "ninja-prod")
	require.NoError(t, err)
	require.Equal(t, schema.LicenseTermActive, actual.LicenseTerm.Status)
	require.Equal(t, schema.InstanceStatusMaintenance, actual.Status)
	require.Equal(t, &churned, actual.LifecycleStage)
}

func TestInstanceTermFailurePaths(t *testing.T) {
	t.Run("missing or foreign lookup is not found", func(t *testing.T) {
		q := &queryStub{lookupErr: pgx.ErrNoRows}
		result, err := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{}}).Execute(t.Context(), "foreign-prod")
		require.Nil(t, result)
		var problem *kaitenerrors.Error
		require.ErrorAs(t, err, &problem)
		require.Equal(t, "GetInstance.NotFound", problem.Code)
	})
	t.Run("unauthenticated has no decision", func(t *testing.T) {
		uc := NewUseCase(Deps{UserProvider: &currentuser.ContextUserProvider{}})
		result, err := uc.Execute(t.Context(), "ninja-prod")
		require.Nil(t, result)
		require.Error(t, err)
	})
	for _, tc := range []struct {
		name                string
		lookupErr, clockErr error
	}{
		{"lookup failure", errors.New("database unavailable"), nil},
		{"clock failure", nil, errors.New("clock unavailable")},
		{"cancellation", context.Canceled, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			q := &queryStub{instance: instanceRow(time.Now()), lookupErr: tc.lookupErr, clockErr: tc.clockErr}
			result, err := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{}}).Execute(t.Context(), "ninja-prod")
			require.Nil(t, result)
			expected := tc.lookupErr
			if expected == nil {
				expected = tc.clockErr
			}
			require.ErrorIs(t, err, expected)
		})
	}
	for _, tc := range []struct {
		name, message                    string
		clockValid, startValid, endValid bool
		missingLicenseSlug               bool
	}{
		{"invalid database clock", "database clock is invalid", false, true, true, false},
		{"missing stored start", "stored license term is incomplete", true, false, true, false},
		{"missing stored end", "stored license term is incomplete", true, true, false, false},
		{"missing assigned license slug", "assigned license slug is missing", true, true, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			now := time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC)
			licenseSlug := "starter"
			q := &queryStub{
				instance: db.GetOneInstanceRow{
					Slug: "ninja-prod", LicenseID: uuid.New(), LicenseSlug: &licenseSlug,
					StartLicenseDate: pgtype.Timestamp{Time: now.Add(-time.Hour), Valid: tc.startValid},
					EndLicenseDate:   pgtype.Timestamp{Time: now.Add(time.Hour), Valid: tc.endValid},
				},
				now: pgtype.Timestamp{Time: now, Valid: tc.clockValid},
			}
			if tc.missingLicenseSlug {
				q.instance.LicenseSlug = nil
			}
			result, err := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{}}).Execute(t.Context(), "ninja-prod")
			require.Nil(t, result)
			require.EqualError(t, err, `instance "ninja-prod": `+tc.message)
			var problem *kaitenerrors.Error
			require.False(t, errors.As(err, &problem), "invariant diagnostics must remain internal")
		})
	}
}

func TestInstanceHydrationFailureHasNoPartialResource(t *testing.T) {
	now := time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC)
	for _, name := range []string{"metadata", "integration lookup", "integration metadata"} {
		t.Run(name, func(t *testing.T) {
			q := &queryStub{instance: instanceRow(now), now: timestamp(now)}
			switch name {
			case "metadata":
				q.instance.Metadata = []byte("[]")
			case "integration lookup":
				q.integrationErr = errors.New("integration database unavailable")
			case "integration metadata":
				q.integrations = []db.GetInstanceIntegrationsRow{{Metadata: []byte("[]")}}
			}
			result, err := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{}}).Execute(t.Context(), "ninja-prod")
			require.Nil(t, result)
			require.Error(t, err)
			require.Zero(t, q.clocks)
		})
	}
}

func TestInstanceRepositoryRemainsPersistedOnly(t *testing.T) {
	now := time.Now().UTC()
	q := &queryStub{instance: instanceRow(now)}
	result, err := NewQueryRepository(q).GetInstance(t.Context(), "ninja-prod", uuid.New())
	require.NoError(t, err)
	require.Nil(t, result.LicenseTerm)
	require.Zero(t, q.clocks)
}

func TestInstanceTermRetainsEndFirstPrecedence(t *testing.T) {
	now := time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC)
	q := &queryStub{instance: instanceRow(now), now: timestamp(now)}
	q.instance.StartLicenseDate = timestamp(now.Add(time.Hour))
	q.instance.EndLicenseDate = timestamp(now.Add(-time.Hour))
	result, err := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{}}).Execute(t.Context(), "ninja-prod")
	require.NoError(t, err)
	require.Equal(t, schema.LicenseTermExpired, result.LicenseTerm.Status)
}
