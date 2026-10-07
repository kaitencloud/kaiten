package instances_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// newInstanceWithStartLicenseDate creates a single instance whose
// start_license_date is the caller's choice, rather than newInstances'
// hardcoded time.Now() -- needed to exercise LICENSE_START phasing
// (including a start date in the future, i.e. a negative window index).
func newInstanceWithStartLicenseDate(t *testing.T, startLicenseDate time.Time) *instanceschema.Instance {
	t.Helper()
	repo := createinstance.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	license := newLicense(t)
	customer := newCustomer(t)

	slug, err := slugutil.GenerateUnique("test-license-start")
	require.NoError(t, err)
	instance, err := repo.CreateInstance(t.Context(), &createinstance.Command{
		Name:             "test-license-start",
		Slug:             &slug,
		Description:      "Test instance",
		StartLicenseDate: startLicenseDate,
		EndLicenseDate:   startLicenseDate.AddDate(1, 0, 0),
		LicenseID:        license.ID,
		CustomerID:       customer.ID,
	}, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	return instance
}

func editInstanceStartLicenseDate(t *testing.T, instance *instanceschema.Instance, newStartLicenseDate time.Time) {
	t.Helper()
	metadataBytes, err := entitlementvalue.ToBytes(instance.Metadata)
	require.NoError(t, err)

	_, err = instancedb.New(testServer.Dependencies.DB).EditInstance(t.Context(), instancedb.EditInstanceParams{
		Name:             instance.Name,
		Description:      instance.Description,
		CustomerID:       instance.CustomerID,
		LicenseID:        instance.LicenseID,
		DeploymentZoneID: instance.DeploymentZoneID,
		StartLicenseDate: pgtype.Timestamp{Time: newStartLicenseDate, Valid: true},
		EndLicenseDate:   pgtype.Timestamp{Time: newStartLicenseDate.AddDate(1, 0, 0), Valid: true},
		Metadata:         metadataBytes,
		OrganizationID:   testDb.DefaultData.OrganizationID,
		UserID:           testDb.DefaultData.UserID,
		Slug:             instance.Slug,
		// Only the start date moves here: a nil NewSlug keeps the slug the
		// instance is addressed by, above.
		NewSlug: nil,
	})
	require.NoError(t, err)
}

// requireNowMidWindow fails unless now is at least a day inside w. The server
// picks its window from the database clock, which can run a few milliseconds
// behind this test process: with a window edge that close to now, the server
// and the test would disagree on the window. A fixture that derives its start
// date from now offsets it by days as well as months, so now lands mid-window.
func requireNowMidWindow(t *testing.T, w period.Window) {
	t.Helper()
	now := time.Now().UTC()
	require.True(t, now.Sub(w.Start) > 24*time.Hour && w.End.Sub(now) > 24*time.Hour,
		"now (%v) must be at least a day inside the window [%v, %v)", now, w.Start, w.End)
}

func TestReportEntitlementUsageMetric_LicenseStart(t *testing.T) {
	t.Run("WhenLicenseStartAnchor_PhasesOffInstanceStartLicenseDate_NotCalendar", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// A start date deliberately off any calendar month boundary, so a
		// calendar-anchored window would disagree with the license-anchored one.
		startLicenseDate := time.Now().UTC().AddDate(0, -2, 0)
		startLicenseDate = time.Date(startLicenseDate.Year(), startLicenseDate.Month(), 15, 10, 30, 0, 0, time.UTC)
		instance := newInstanceWithStartLicenseDate(t, startLicenseDate)
		entitlement := newPeriodicEntitlement(t, period.Month, period.LicenseStart)
		assignEntitlementToLicense(t, instance.LicenseSlug, entitlement.Slug, 1000)

		wantWindow, err := period.Current(time.Now().UTC(), period.Month, period.LicenseStart, startLicenseDate)
		require.NoError(t, err)
		// Sanity check the fixture actually exercises LICENSE_START phasing: the
		// license-anchored window must NOT coincide with the calendar month.
		calendarWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		require.False(t, wantWindow.Start.Equal(calendarWindow.Start), "fixture must exercise a non-calendar-aligned phase")

		payload := map[string]any{"value": map[string]any{"type": "number", "value": 7}, "behavior": "append"}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instance.Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		row := getUsageRow(t, instance.ID, entitlement.ID)
		require.True(t, row.PeriodStart.Valid)
		require.True(t, row.PeriodStart.Time.Equal(wantWindow.Start),
			"period_start = %v, want the LICENSE_START-phased window start %v (not the calendar month %v)",
			row.PeriodStart.Time, wantWindow.Start, calendarWindow.Start)
	})

	t.Run("WhenNowBeforeStartLicenseDate_NegativeWindowIndexStillWorks", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// start_license_date in the future relative to now: the active window
		// has a negative index (see period.Current's negative-index handling).
		// The extra 15 days keep now mid-window: exactly six months ahead would
		// start the window on the test's own now (see requireNowMidWindow).
		// Truncated to millisecond precision to match the TIMESTAMP(3) column
		// -- otherwise the DB round-trip would silently drop sub-millisecond
		// precision that this test's own expectation still carries.
		futureStart := time.Now().UTC().AddDate(0, 6, 15).Truncate(time.Millisecond)
		instance := newInstanceWithStartLicenseDate(t, futureStart)
		entitlement := newPeriodicEntitlement(t, period.Month, period.LicenseStart)
		assignEntitlementToLicense(t, instance.LicenseSlug, entitlement.Slug, 1000)

		wantWindow, err := period.Current(time.Now().UTC(), period.Month, period.LicenseStart, futureStart)
		require.NoError(t, err)
		require.True(t, wantWindow.Start.Before(futureStart),
			"window start %v must be before start_license_date %v (a negative index)", wantWindow.Start, futureStart)
		requireNowMidWindow(t, wantWindow)

		payload := map[string]any{"value": map[string]any{"type": "number", "value": 3}, "behavior": "append"}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instance.Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		row := getUsageRow(t, instance.ID, entitlement.ID)
		require.True(t, row.PeriodStart.Valid)
		require.True(t, row.PeriodStart.Time.Equal(wantWindow.Start),
			"period_start = %v, want the negative-index window start %v", row.PeriodStart.Time, wantWindow.Start)
	})

	t.Run("WhenStartLicenseDateChanges_RollsOverOnNextReportWithNonDerivableEnd", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Both start dates are offset by days as well as months: now stays
		// mid-window under either phase (see requireNowMidWindow), and the two
		// phases differ by days rather than by the milliseconds between two
		// time.Now() calls.
		// Truncated to millisecond precision to match the TIMESTAMP(3) column.
		originalStart := time.Now().UTC().AddDate(0, -1, -10).Truncate(time.Millisecond)
		instance := newInstanceWithStartLicenseDate(t, originalStart)
		entitlement := newPeriodicEntitlement(t, period.Month, period.LicenseStart)
		assignEntitlementToLicense(t, instance.LicenseSlug, entitlement.Slug, 1000)

		firstWindow, err := period.Current(time.Now().UTC(), period.Month, period.LicenseStart, originalStart)
		require.NoError(t, err)
		requireNowMidWindow(t, firstWindow)
		seedUsageRow(t, instance.Slug, entitlement.Slug, 55, 2, &firstWindow.Start)

		// Re-phase the instance: the stored period_start no longer aligns to
		// any window boundary under the new start_license_date.
		newStart := time.Now().UTC().AddDate(0, -3, -20).Truncate(time.Millisecond)
		editInstanceStartLicenseDate(t, instance, newStart)

		newWindow, err := period.Current(time.Now().UTC(), period.Month, period.LicenseStart, newStart)
		require.NoError(t, err)
		requireNowMidWindow(t, newWindow)

		payload := map[string]any{"value": map[string]any{"type": "number", "value": 1}, "behavior": "append"}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instance.Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		payloads := rolloverEvents(t)
		require.Len(t, payloads, 1)
		require.False(t, payloads[0].IsSynthetic)
		require.NotNil(t, payloads[0].ClosedPeriodStart)
		require.True(t, payloads[0].ClosedPeriodStart.Equal(firstWindow.Start),
			"closed_period_start = %v, want the seeded window start %v", *payloads[0].ClosedPeriodStart, firstWindow.Start)
		require.Nil(t, payloads[0].ClosedPeriodEnd, "the old window's end is not derivable under the new phase")
		require.Equal(t, 55.0, payloads[0].Value)
		require.EqualValues(t, 2, payloads[0].EventCount)
		require.True(t, payloads[0].NewPeriodStart.Equal(newWindow.Start),
			"new_period_start = %v, want the re-phased window start %v", payloads[0].NewPeriodStart, newWindow.Start)

		row := getUsageRow(t, instance.ID, entitlement.ID)
		require.True(t, row.PeriodStart.Time.Equal(newWindow.Start),
			"period_start = %v, want the re-phased window start %v", row.PeriodStart.Time, newWindow.Start)
	})
}
