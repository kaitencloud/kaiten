package dogfooding

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
)

// configServer answers every entitlement read with status and body, both
// swappable mid-test, and counts the reads.
type configServer struct {
	*httptest.Server
	status atomic.Int64
	body   atomic.Value
	reads  atomic.Int32
}

func newConfigServer(t *testing.T) *configServer {
	t.Helper()
	s := &configServer{}
	s.answer(http.StatusOK, `{"value":{"type":"object","value":{"months":6}}}`)
	s.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/entitlements/"+UsageHistoryRetentionEntitlementSlug+"/usage") {
			http.NotFound(w, r)
			return
		}
		s.reads.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(int(s.status.Load()))
		_, _ = w.Write([]byte(s.body.Load().(string)))
	}))
	t.Cleanup(s.Close)
	return s
}

func (s *configServer) answer(status int, body string) {
	s.status.Store(int64(status))
	s.body.Store(body)
}

func newConfigReporter(t *testing.T, apiURL string, own uuid.UUID) *Reporter {
	t.Helper()
	tokenFile := filepath.Join(t.TempDir(), "service-token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("token"), 0o600))
	reporter, err := NewReporter(t.Context(), Config{APIURL: apiURL, OrgID: own.String()}, tokenFile)
	require.NoError(t, err)
	t.Cleanup(reporter.Close)
	return reporter
}

// age backdates every cached read past the TTL.
func (c *configCache) age() {
	c.mu.Lock()
	defer c.mu.Unlock()
	for key, entry := range c.entries {
		entry.readAt = entry.readAt.Add(-configValueTTL - time.Minute)
		c.entries[key] = entry
	}
}

func TestConfigValueIsCachedForADay(t *testing.T) {
	server := newConfigServer(t)
	reporter := newConfigReporter(t, server.URL, uuid.New())
	org := uuid.New()

	for range 3 {
		value, err := reporter.ConfigValue(t.Context(), org, UsageHistoryRetentionEntitlementSlug)
		require.NoError(t, err)
		require.JSONEq(t, `{"months":6}`, string(value))
	}
	require.EqualValues(t, 1, server.reads.Load())

	server.answer(http.StatusOK, `{"value":{"type":"object","value":{"months":12}}}`)
	reporter.configs.age()
	value, err := reporter.ConfigValue(t.Context(), org, UsageHistoryRetentionEntitlementSlug)
	require.NoError(t, err)
	require.JSONEq(t, `{"months":12}`, string(value))
	require.EqualValues(t, 2, server.reads.Load())
}

func TestConfigValueAnswersTheLastKnownValueWhenTheAuthorityFails(t *testing.T) {
	server := newConfigServer(t)
	reporter := newConfigReporter(t, server.URL, uuid.New())
	known, neverRead := uuid.New(), uuid.New()

	_, err := reporter.ConfigValue(t.Context(), known, UsageHistoryRetentionEntitlementSlug)
	require.NoError(t, err)

	server.answer(http.StatusServiceUnavailable, `{"title":"unavailable"}`)
	reporter.configs.age()

	value, err := reporter.ConfigValue(t.Context(), known, UsageHistoryRetentionEntitlementSlug)
	require.NoError(t, err, "a stale value beats no value")
	require.JSONEq(t, `{"months":6}`, string(value))

	_, err = reporter.ConfigValue(t.Context(), neverRead, UsageHistoryRetentionEntitlementSlug)
	require.Error(t, err, "an organization never read has no value to fall back on")
	require.NotErrorIs(t, err, services.ErrNoLicensingAuthority)
}

func TestConfigValueIsNilWhenTheLicenceDoesNotGrantIt(t *testing.T) {
	server := newConfigServer(t)
	server.answer(http.StatusNotFound, `{"title":"not found"}`)
	reporter := newConfigReporter(t, server.URL, uuid.New())

	value, err := reporter.ConfigValue(t.Context(), uuid.New(), UsageHistoryRetentionEntitlementSlug)
	require.NoError(t, err)
	require.Nil(t, value)
}

func TestConfigValueRefusesANonConfigEntitlement(t *testing.T) {
	server := newConfigServer(t)
	server.answer(http.StatusOK, `{"value":{"type":"number","value":6}}`)
	reporter := newConfigReporter(t, server.URL, uuid.New())

	_, err := reporter.ConfigValue(t.Context(), uuid.New(), UsageHistoryRetentionEntitlementSlug)
	require.Error(t, err)
}

func TestConfigValueHasNoAuthorityForItsOwnOrganization(t *testing.T) {
	server := newConfigServer(t)
	own := uuid.New()
	reporter := newConfigReporter(t, server.URL, own)

	_, err := reporter.ConfigValue(t.Context(), own, UsageHistoryRetentionEntitlementSlug)
	require.ErrorIs(t, err, services.ErrNoLicensingAuthority)
	require.Zero(t, server.reads.Load())
}
