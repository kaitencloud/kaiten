package dogfooding

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
	ofsdk "github.com/open-feature/go-sdk/openfeature"
	"github.com/stretchr/testify/require"
)

func TestReporterFlagSourcesCannotReplaceEachOthersProvider(t *testing.T) {
	// Two separately wired authorities, including a supplied usage reporter and
	// the server's flag-only reporter, must never share provider registrations.
	serverFor := func(value string) *httptest.Server {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, "/api/ofrep/v1/evaluate/flags/ai-credits", r.URL.Path)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"key":"ai-credits","value":` + value + `,"reason":"STATIC"}`))
		}))
		t.Cleanup(server.Close)
		return server
	}
	t.Cleanup(ofsdk.Shutdown)
	target := uuid.New()
	first := newConfigReporter(t, serverFor("false").URL, uuid.New())
	value, err := first.BooleanValue(t.Context(), target, "ai-credits")
	require.NoError(t, err)
	require.False(t, value)

	second := newConfigReporter(t, serverFor("true").URL, uuid.New())
	value, err = second.BooleanValue(t.Context(), target, "ai-credits")
	require.NoError(t, err)
	require.True(t, value)
	value, err = first.BooleanValue(t.Context(), target, "ai-credits")
	require.NoError(t, err)
	require.False(t, value, "a second reporter must not replace the first flag authority")

	// Rotating either source keeps its identity and must not rebind the other.
	for _, reporter := range []*Reporter{first, second} {
		require.NoError(t, os.WriteFile(reporter.tokenFile, []byte("synthetic-rotated-token"), 0o600))
		reporter.reload()
		value, err = first.BooleanValue(t.Context(), target, "ai-credits")
		require.NoError(t, err)
		require.False(t, value)
		value, err = second.BooleanValue(t.Context(), target, "ai-credits")
		require.NoError(t, err)
		require.True(t, value)
	}
}
