package graphql

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestOperationDeadlineBoundsEveryRequest pins the three properties
// withOperationDeadline exists for. None of them is observable further down:
// gqlgen answers an already-expired context by returning nil -- its
// end-of-stream signal -- rather than an error, so a request driven through
// the whole route produces no evidence of the budget either way. The seam is
// where the behaviour is, so the seam is where it is asserted.
func TestOperationDeadlineBoundsEveryRequest(t *testing.T) {
	t.Parallel()

	t.Run("the operation runs under the budget", func(t *testing.T) {
		t.Parallel()

		var deadline time.Time
		var hasDeadline bool
		serve(t, context.Background(), func(r *http.Request) {
			deadline, hasDeadline = r.Context().Deadline()
		})

		require.True(t, hasDeadline, "an operation with no deadline is the state this wrapper exists to end")
		assert.WithinDuration(t, time.Now().Add(OperationTimeout), deadline, 5*time.Second)
	})

	// The timer is released on the way out rather than held for the remainder
	// of the budget. At one request per connection this is invisible; at the
	// rate a console page load produces, thirty seconds of retained contexts
	// per request is a leak with a slow enough fuse to reach production.
	t.Run("the budget is released once the operation is answered", func(t *testing.T) {
		t.Parallel()

		var inner context.Context
		serve(t, context.Background(), func(r *http.Request) { inner = r.Context() })

		require.Error(t, inner.Err(), "the context must not outlive the request it was built for")
		assert.ErrorIs(t, inner.Err(), context.Canceled)
	})

	// The budget is a ceiling, never a floor: a caller that hangs up is not
	// owed thirty seconds of work nobody will read.
	t.Run("a client that hangs up cancels the work at once", func(t *testing.T) {
		t.Parallel()

		hungUp, cancel := context.WithCancel(context.Background())
		cancel()

		// Read while the handler is still running. Reading afterwards proves
		// nothing: withOperationDeadline's own cancel has fired by then, so a
		// wrapper that ignored the request context entirely would look
		// identical from outside.
		var errInFlight error
		serve(t, hungUp, func(r *http.Request) { errInFlight = r.Context().Err() })

		require.Error(t, errInFlight,
			"the budget must derive from the request context, not stand apart from it")
		assert.ErrorIs(t, errInFlight, context.Canceled)
		assert.False(t, errors.Is(errInFlight, context.DeadlineExceeded),
			"a hang-up is not a timeout, and must not be reported as one")
	})
}

// serve drives one request through withOperationDeadline, handing inspect the
// request as the wrapped handler receives it.
func serve(t *testing.T, parent context.Context, inspect func(*http.Request)) {
	t.Helper()

	reached := false
	handler := withOperationDeadline(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		reached = true
		inspect(r)
	}))

	req := httptest.NewRequest(http.MethodPost, "/graphql", nil).WithContext(parent)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	require.True(t, reached, "the wrapper must pass the request on, not swallow it")
}
