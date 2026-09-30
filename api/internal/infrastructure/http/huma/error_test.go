package huma

import (
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"testing"

	humalib "github.com/danielgtaylor/huma/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// internalCauseText is a stand-in for a raw internal error (e.g. a driver
// or SQL error) that a handler wraps into a *kaitenerrors.Error. It must
// never reach the client in any form.
const internalCauseText = "pq: duplicate key value violates unique constraint \"license_slug_key\""

func TestNewError_TypedErrorKeepsStatusCodeAndMessage(t *testing.T) {
	cause := errors.New(internalCauseText)

	tests := []struct {
		name       string
		kind       kaitenerrors.Kind
		wantStatus int
	}{
		{"not found", kaitenerrors.KindNotFound, http.StatusNotFound},
		{"unauthorized", kaitenerrors.KindUnauthorized, http.StatusUnauthorized},
		{"forbidden", kaitenerrors.KindForbidden, http.StatusForbidden},
		{"conflict", kaitenerrors.KindConflict, http.StatusConflict},
		{"validation", kaitenerrors.KindValidation, http.StatusBadRequest},
		{"unprocessable", kaitenerrors.KindUnprocessable, http.StatusUnprocessableEntity},
		{"internal", kaitenerrors.KindInternal, http.StatusInternalServerError},
		{"unknown", kaitenerrors.KindUnknown, http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := kaitenerrors.Wrap(cause, tt.kind, "Test.Code", "a safe public message")

			// huma guesses 500 for any handler error; the typed error's own
			// status must win.
			se := newError(nil, http.StatusInternalServerError, "unexpected error occurred", err)

			assert.Equal(t, tt.wantStatus, se.GetStatus())
			assert.Equal(t, "a safe public message", se.Error(),
				"the client-visible detail must be exactly the constructor's message")

			model, ok := se.(*kaitenerrors.Problem)
			require.True(t, ok, "expected the shared RFC 9457 model")
			assert.Equal(t, "Test.Code", model.Code,
				"the business code belongs in `code`, not smuggled through another member")
			assert.Empty(t, model.Errors)
			assert.Empty(t, model.ErrorID, "nothing was withheld, so there is nothing to correlate")

			body, marshalErr := json.Marshal(model)
			require.NoError(t, marshalErr)
			assert.NotContains(t, string(body), internalCauseText,
				"the wrapped cause must not leak into any member of the body")
		})
	}
}

// TestTypedErrorRendersIdenticallyThroughBothPaths pins the reason
// *apierrors.Error implements huma.StatusError: huma serializes the error
// itself when it does, and that must produce the very same body the error
// factory would have produced.
func TestTypedErrorRendersIdenticallyThroughBothPaths(t *testing.T) {
	err := kaitenerrors.Wrap(errors.New(internalCauseText), kaitenerrors.KindConflict,
		"License.SlugTaken", "a license with this slug already exists")

	direct, marshalErr := json.Marshal(err)
	require.NoError(t, marshalErr)

	viaFactory, marshalErr := json.Marshal(newError(nil, http.StatusInternalServerError, "unexpected error occurred", err))
	require.NoError(t, marshalErr)

	assert.JSONEq(t, string(direct), string(viaFactory))
	assert.Equal(t, http.StatusConflict, err.GetStatus())
	assert.Equal(t, "application/problem+json", err.ContentType("application/json"))
}

func TestNewError_UntypedErrorIsWithheldAndCorrelated(t *testing.T) {
	pgxFailure := errors.New(`ERROR: column "licence_type" does not exist (SQLSTATE 42703)`)

	se := newError(nil, http.StatusInternalServerError, "unexpected error occurred", pgxFailure)

	model, ok := se.(*kaitenerrors.Problem)
	require.True(t, ok)

	body, err := json.Marshal(model)
	require.NoError(t, err)
	assert.NotContains(t, string(body), "licence_type")
	assert.NotContains(t, string(body), "SQLSTATE")
	assert.Empty(t, model.Errors, "the driver text must not survive in errors[]")
	assert.NotEmpty(t, model.ErrorID, "a withheld cause must be correlatable to the log entry")
	assert.Equal(t, kaitenerrors.KindInternal.String(), model.Code)
}

func TestNewError_KeepsHumaValidationDetails(t *testing.T) {
	// Request-validation details describe the caller's OWN input, so they
	// are the one thing errors[] must still carry.
	se := newError(
		nil, http.StatusUnprocessableEntity, "validation failed",
		&humalib.ErrorDetail{
			Message:  "expected required property name to be present",
			Location: "body.name",
			Value:    nil,
		},
	)

	model, ok := se.(*kaitenerrors.Problem)
	require.True(t, ok)
	require.Len(t, model.Errors, 1)
	assert.Equal(t, "expected required property name to be present", model.Errors[0].Message)
	assert.Equal(t, "body.name", model.Errors[0].Location)
	assert.Empty(t, model.ErrorID, "structured validation details are not withheld")
}

func TestNewError_DropsNilErrors(t *testing.T) {
	se := newError(nil, http.StatusUnprocessableEntity, "type is required", nil)

	body, err := json.Marshal(se)
	require.NoError(t, err)
	assert.NotContains(t, string(body), "null")

	model, ok := se.(*kaitenerrors.Problem)
	require.True(t, ok)
	assert.Empty(t, model.Errors)
}

func TestSetErrorHandler_ConcurrentCallsDoNotRace(t *testing.T) {
	// Regression guard for the race this fix removes: server.New used to
	// call SetErrorHandler on every construction, unsynchronized, and
	// tests construct many *Server instances (including in parallel).
	// sync.Once makes every call after the first a no-op; run this under
	// `go test -race` to confirm the assignment itself is race-free.
	var wg sync.WaitGroup
	for range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			SetErrorHandler()
		}()
	}
	wg.Wait()

	require.NotNil(t, humalib.NewErrorWithContext)

	// Sanity: the installed handler still behaves like ours, not the
	// library default, after all those concurrent (no-op past the first)
	// calls.
	se := humalib.NewErrorWithContext(nil, http.StatusInternalServerError, "unused",
		kaitenerrors.Conflict("Test.Code", "already exists"))
	assert.Equal(t, http.StatusConflict, se.GetStatus())
	assert.Equal(t, "already exists", se.Error())

	// And huma.NewError is replaced too — that is what makes
	// apierrors.Problem the error schema published in the contract.
	_, ok := humalib.NewError(http.StatusNotFound, "nope").(*kaitenerrors.Problem)
	assert.True(t, ok)
}
