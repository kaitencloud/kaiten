package stripe_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	tier2 "github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// Each read crosses a millisecond boundary, without sleeps or wall-clock
// luck. Only a transaction that explicitly selects this test schema sees it;
// pg_catalog's clock and the production constraints are untouched.
const advancingCheckoutClock = `
CREATE SCHEMA checkout_test_clock;
CREATE SEQUENCE checkout_test_clock.ticks;
CREATE TABLE checkout_test_clock.origin AS SELECT pg_catalog.clock_timestamp() AS instant;
CREATE FUNCTION checkout_test_clock.clock_timestamp() RETURNS timestamptz
LANGUAGE sql VOLATILE AS $$
  SELECT instant + nextval('checkout_test_clock.ticks') * interval '1 millisecond'
  FROM checkout_test_clock.origin
$$;
`

// Exercise the actual cardless-trial HTTP completion transaction. The
// customer insert selects the deterministic clock for that transaction only,
// before the close query; unrelated connections keep the real clock.
func TestAnonymousCheckoutTrialCloseClockBoundary(t *testing.T) {
	fresh(t)
	s := newStorefront(t, map[string]any{"trialPeriodDays": 14})
	opened := startAnonymous(t, s, "clock-boundary@startup.test")
	require.Zero(t, opened.DueToday.Total)
	require.False(t, opened.RequiresPaymentMethod)

	_, err := testServer.Dependencies.DB.Exec(t.Context(), advancingCheckoutClock+`
CREATE FUNCTION checkout_test_clock.select_clock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('search_path', 'checkout_test_clock, public, pg_catalog', true);
  RETURN NEW;
END
$$;
CREATE TRIGGER checkout_test_clock BEFORE INSERT ON customer
FOR EACH ROW WHEN (NEW.billing_email = 'clock-boundary@startup.test')
EXECUTE FUNCTION checkout_test_clock.select_clock();
`)
	require.NoError(t, err)
	fake.Fail(stripefake.OpCreateCustomer, http.StatusInternalServerError, "api_error", "", 1)
	before := len(fake.CallsOf(stripefake.OpCreateCustomer))
	done := confirmAnonymous(t, opened)
	require.Equal(t, tier2.ConfirmCompleted, done.Status)
	require.Len(t, fake.CallsOf(stripefake.OpCreateCustomer), before+1, "provider failure after commit undoes nothing")
	require.Equal(t, 1, customersWithEmail(t, "clock-boundary@startup.test"))
	require.Equal(t, 1, outboxCount(t, events.CheckoutSessionCompleted.Name))

	var completedAt, closedAt, updatedAt time.Time
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT completed_at, closed_at, updated_at FROM checkout_session WHERE id = $1`, opened.SessionID).
		Scan(&completedAt, &closedAt, &updatedAt))
	require.Equal(t, completedAt, closedAt)
	require.Equal(t, closedAt, updatedAt)
	sub := commonfixture.AssertJSONResponse[map[string]any](t,
		call(t, "GET", "/api/instances/"+*done.Session.InstanceSlug+"/billing", nil), fiber.StatusOK)
	require.Equal(t, "TRIAL", sub["status"])
	require.Equal(t, "STRIPE", sub["providerKind"])
	require.Equal(t, "CHARGE_AUTOMATICALLY", sub["collectionMethod"])
	require.Empty(t, fake.CallsOf(stripefake.OpPayInvoice))
	require.Equal(t, "ConfirmCheckoutSession.SessionClosed", confirmProblem(t, opened, fiber.StatusConflict))
	require.Equal(t, 1, outboxCount(t, events.CheckoutSessionCompleted.Name), "no second completion")
}

// All terminal writers share the same equality constraint, including the
// payment follower and expiry/reaping paths. Run the generated queries, not
// copies of their SQL, against the real schema with an advancing clock.
func TestCheckoutSessionCloseUsesOneInstant(t *testing.T) {
	fresh(t)
	s := newStorefront(t, nil)
	resources := newSold(t, "clock-resources")
	for _, terminal := range []string{"complete", "pay", "expire", "abandon"} {
		t.Run(terminal, func(t *testing.T) {
			opened := startAnonymous(t, s, terminal+"@startup.test")
			tx, err := testServer.Dependencies.DB.Begin(t.Context())
			require.NoError(t, err)
			defer func() { require.NoError(t, tx.Rollback(context.Background())) }()
			_, err = tx.Exec(t.Context(), advancingCheckoutClock+`
SET LOCAL search_path = checkout_test_clock, public, pg_catalog;
SET LOCAL TIME ZONE 'Pacific/Honolulu';
`)
			require.NoError(t, err)
			q := db.New(tx)
			org := testDb.DefaultData.OrganizationID
			if terminal == "pay" || terminal == "expire" {
				_, err = q.AwaitCheckoutPayment(t.Context(), db.AwaitCheckoutPaymentParams{
					OrganizationID: org, ID: *opened.SessionID,
					CustomerID: &resources.customer.ID, InstanceID: &resources.instance.ID,
				})
				require.NoError(t, err)
			}
			closeSession := func() error {
				switch terminal {
				case "complete":
					_, err := q.CompleteCheckoutSession(t.Context(), db.CompleteCheckoutSessionParams{
						OrganizationID: org, ID: *opened.SessionID,
						CustomerID: &resources.customer.ID, InstanceID: &resources.instance.ID,
					})
					return err
				case "pay":
					return q.PayCheckoutSession(t.Context(), db.PayCheckoutSessionParams{OrganizationID: org, ID: *opened.SessionID})
				case "expire":
					return q.ExpireCheckoutSession(t.Context(), db.ExpireCheckoutSessionParams{OrganizationID: org, ID: *opened.SessionID})
				default:
					_, err := q.AbandonCheckoutSession(t.Context(), db.AbandonCheckoutSessionParams{OrganizationID: org, ID: *opened.SessionID})
					return err
				}
			}
			require.NoError(t, closeSession())
			row, err := q.LockCheckoutSession(t.Context(), db.LockCheckoutSessionParams{OrganizationID: org, ID: *opened.SessionID})
			require.NoError(t, err)
			var terminalAt pgtype.Timestamp
			switch terminal {
			case "complete", "pay":
				require.Equal(t, db.CheckoutSessionStatusCOMPLETED, row.Status)
				terminalAt = row.CompletedAt
			case "expire":
				require.Equal(t, db.CheckoutSessionStatusEXPIRED, row.Status)
				terminalAt = row.ExpiredAt
			default:
				require.Equal(t, db.CheckoutSessionStatusABANDONED, row.Status)
				terminalAt = row.AbandonedAt
			}
			var ticks int64
			var originUTC time.Time
			require.NoError(t, tx.QueryRow(t.Context(), `
SELECT ticks.last_value, origin.instant AT TIME ZONE 'UTC'
FROM checkout_test_clock.ticks, checkout_test_clock.origin`).Scan(&ticks, &originUTC))
			wantTicks := int64(1)
			if terminal == "pay" || terminal == "expire" {
				wantTicks++ // AwaitCheckoutPayment also reads the clock once.
			}
			require.Equal(t, wantTicks, ticks, "one wall-clock read for the terminal update")
			require.True(t, terminalAt.Valid)
			require.Equal(t, originUTC.Add(time.Duration(ticks)*time.Millisecond).Truncate(time.Millisecond), terminalAt.Time, "UTC wall-clock time, not transaction-start time")
			require.Equal(t, terminalAt, row.ClosedAt)
			require.Equal(t, row.ClosedAt, row.UpdatedAt)
			require.False(t, row.ClosedAt.Time.Before(row.CreatedAt.Time))
			require.True(t, row.ExpiresAt.Time.After(row.CreatedAt.Time))
			if terminal == "abandon" {
				require.Nil(t, row.CustomerID)
				require.Nil(t, row.InstanceID)
			} else {
				require.Equal(t, &resources.customer.ID, row.CustomerID)
				require.Equal(t, &resources.instance.ID, row.InstanceID)
			}
			// A repeated terminal update must not re-date the close.
			err = closeSession()
			if terminal == "complete" || terminal == "abandon" {
				require.ErrorIs(t, err, pgx.ErrNoRows)
			} else {
				require.NoError(t, err)
			}
			again, err := q.LockCheckoutSession(t.Context(), db.LockCheckoutSessionParams{OrganizationID: org, ID: *opened.SessionID})
			require.NoError(t, err)
			require.Equal(t, row, again)
		})
	}
}
