package graphql

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// GraphQL had no error presenter at all, so gqlgen's default put
// err.Error() straight into the response — and since GraphQL answers 200,
// nothing downstream flagged it. The JS SDK concatenates those messages
// into an Error, so a driver or parser string ended up in the browser and
// in the customer's telemetry.
func TestPresentErrorWithholdsAnUntypedError(t *testing.T) {
	t.Parallel()

	raw := fmt.Errorf("querying customers: %w", errors.New("failed to connect to `host=10.0.0.1 user=kaiten database=kaiten`"))

	presented := presentError(context.Background(), raw)

	require.NotNil(t, presented)
	assert.Equal(t, "An unexpected error occurred", presented.Message)
	assert.NotContains(t, presented.Message, "10.0.0.1")
	assert.Equal(t, apierrors.KindInternal.String(), presented.Extensions["code"])
	assert.NotEmpty(t, presented.Extensions["errorId"], "the withheld error stays recoverable from the logs by its correlation id")
}

// The other half: an error the API deliberately reports must survive the
// presenter, with its code attached so a client can act on it. This is what
// every paginated resolver now returns for a malformed cursor.
func TestPresentErrorKeepsATypedError(t *testing.T) {
	t.Parallel()

	typed := apierrors.Wrap(errors.New("pagination: invalid cursor: illegal base64 data at input byte 3"),
		apierrors.KindValidation, "Customers.InvalidCursor", "invalid cursor")

	presented := presentError(context.Background(), typed)

	require.NotNil(t, presented)
	assert.Equal(t, "invalid cursor", presented.Message)
	assert.Equal(t, "Customers.InvalidCursor", presented.Extensions["code"])
	assert.Equal(t, 400, presented.Extensions["status"])
	assert.Empty(t, presented.Extensions["errorId"], "a client-safe error needs no correlation id")
}

// The third case the presenter has to tell apart: an operation that outran
// OperationTimeout. Without this branch it reads as the untyped half above --
// "An unexpected error occurred" plus a correlation id for something that is
// neither unexpected nor a fault to correlate -- and a caller cannot tell "too
// slow" from "broken", which is the difference between retrying and asking for
// less.
func TestPresentErrorNamesATimedOutOperation(t *testing.T) {
	t.Parallel()

	t.Run("raw", func(t *testing.T) {
		t.Parallel()

		presented := presentError(context.Background(), context.DeadlineExceeded)

		require.NotNil(t, presented)
		assert.Equal(t, errOperationTimeout, presented.Extensions["code"])
		assert.NotContains(t, presented.Message, "unexpected")
		assert.Empty(t, presented.Extensions["errorId"], "a deadline is not an incident to correlate")
	})

	// It never arrives bare in production: it comes back up through pgx,
	// wrapped in whatever the driver has to say about the connection.
	t.Run("wrapped, the way pgx returns it", func(t *testing.T) {
		t.Parallel()

		presented := presentError(
			context.Background(),
			fmt.Errorf("querying instances: %w", context.DeadlineExceeded),
		)

		require.NotNil(t, presented)
		assert.Equal(t, errOperationTimeout, presented.Extensions["code"])
		assert.NotContains(t, presented.Message, "querying instances",
			"the presented message is ours, never the driver's")
	})
}
