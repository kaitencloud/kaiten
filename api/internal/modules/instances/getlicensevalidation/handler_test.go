package getlicensevalidation

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
	instance  db.GetOneInstanceRow
	now       pgtype.Timestamp
	lookupErr error
	clockErr  error
	params    db.GetOneInstanceParams
}

func (q *queryStub) GetOneInstance(_ context.Context, params db.GetOneInstanceParams) (db.GetOneInstanceRow, error) {
	q.params = params
	return q.instance, q.lookupErr
}
func (q *queryStub) GetDatabaseNow(context.Context) (pgtype.Timestamp, error) {
	return q.now, q.clockErr
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
				instance: db.GetOneInstanceRow{Slug: "ninja-prod", LicenseID: licenseID, LicenseSlug: &slug,
					StartLicenseDate: timestamp(start), EndLicenseDate: timestamp(end)},
				now: timestamp(tc.now),
			}
			uc := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{OrganizationID: orgID}})
			actual, err := uc.Execute(t.Context(), "ninja-prod")
			require.NoError(t, err)
			require.Equal(t, tc.status, actual.Status)
			require.Equal(t, tc.status == schema.LicenseTermActive, actual.Valid)
			require.Equal(t, orgID, q.params.OrganizationID)
			require.Equal(t, "ninja-prod", q.params.Slug)
			require.Equal(t, licenseID, actual.LicenseID)
			require.Equal(t, slug, actual.LicenseSlug)
			require.Equal(t, time.UTC, actual.EvaluatedAt.Location())
			require.Equal(t, start.UTC(), actual.StartLicenseDate)
			require.Equal(t, end.UTC(), actual.EndLicenseDate)
		})
	}
}

func TestValidationDoesNotTurnOperationalSignalsIntoSuspension(t *testing.T) {
	now := time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC)
	churned := "CHURNED"
	q := &queryStub{instance: db.GetOneInstanceRow{Status: db.InstanceStatusMAINTENANCE, LifecycleStage: &churned,
		StartLicenseDate: timestamp(now.Add(-time.Hour)), EndLicenseDate: timestamp(now.Add(time.Hour))}, now: timestamp(now)}
	actual, err := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{}}).Execute(t.Context(), "ninja-prod")
	require.NoError(t, err)
	require.True(t, actual.Valid)
}

func TestValidationFailurePaths(t *testing.T) {
	t.Run("missing or foreign lookup is not found", func(t *testing.T) {
		q := &queryStub{lookupErr: pgx.ErrNoRows}
		result, err := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{}}).Execute(t.Context(), "foreign-prod")
		require.Nil(t, result)
		var problem *kaitenerrors.Error
		require.ErrorAs(t, err, &problem)
		require.Equal(t, "GetLicenseValidation.NotFound", problem.Code)
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
			q := &queryStub{lookupErr: tc.lookupErr, clockErr: tc.clockErr}
			result, err := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{}}).Execute(t.Context(), "ninja-prod")
			require.Nil(t, result)
			expected := tc.lookupErr
			if expected == nil {
				expected = tc.clockErr
			}
			require.ErrorIs(t, err, expected)
		})
	}
	t.Run("incomplete stored term fails closed", func(t *testing.T) {
		q := &queryStub{now: timestamp(time.Now())}
		result, err := NewUseCase(Deps{Queries: q, UserProvider: &currentuser.StaticUserProvider{}}).Execute(t.Context(), "ninja-prod")
		require.Nil(t, result)
		require.Error(t, err)
	})
}
