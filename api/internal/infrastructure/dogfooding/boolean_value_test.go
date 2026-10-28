package dogfooding

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	ofsdk "github.com/open-feature/go-sdk/openfeature"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/dogfoodingctx"
)

type flagProvider struct {
	ofsdk.NoopProvider
	evaluate func(context.Context, string, bool, ofsdk.FlattenedContext) ofsdk.BoolResolutionDetail
	events   chan ofsdk.Event
	calls    atomic.Int32
}

func (p *flagProvider) BooleanEvaluation(ctx context.Context, key string, fallback bool, evaluationContext ofsdk.FlattenedContext) ofsdk.BoolResolutionDetail {
	p.calls.Add(1)
	return p.evaluate(ctx, key, fallback, evaluationContext)
}

func (p *flagProvider) EventChannel() <-chan ofsdk.Event { return p.events }

func flagResult(value bool, reason ofsdk.Reason) ofsdk.BoolResolutionDetail {
	return ofsdk.BoolResolutionDetail{
		Value: value,
		ProviderResolutionDetail: ofsdk.ProviderResolutionDetail{
			Reason: reason,
		},
	}
}

func reporterWithFlagProvider(t *testing.T, provider *flagProvider) *Reporter {
	t.Helper()
	domain := t.Name()
	require.NoError(t, ofsdk.SetNamedProviderAndWait(domain, provider))
	t.Cleanup(ofsdk.Shutdown)
	return &Reporter{
		client:          &client{ofClient: ofsdk.NewClient(domain)},
		flagSourceReady: true,
		closed:          make(chan struct{}),
	}
}

func TestReporterBooleanValueDefaultOffAndResolutionDetails(t *testing.T) {
	providerError := flagResult(true, ofsdk.StaticReason)
	providerError.ResolutionError = ofsdk.NewGeneralResolutionError("unavailable")
	brokenRules := flagResult(true, ofsdk.DefaultReason)
	brokenRules.FlagMetadata = ofsdk.FlagMetadata{brokenTargetingRulesMetadataKey: []string{"invalid rule"}}
	brokenMetadata := flagResult(true, ofsdk.TargetingMatchReason)
	brokenMetadata.FlagMetadata = ofsdk.FlagMetadata{brokenTargetingRulesMetadataKey: nil}

	for _, tc := range []struct {
		name    string
		result  ofsdk.BoolResolutionDetail
		want    bool
		wantErr bool
	}{
		{name: "enabled static", result: flagResult(true, ofsdk.StaticReason), want: true},
		{name: "enabled targeting", result: flagResult(true, ofsdk.TargetingMatchReason), want: true},
		{name: "enabled default variant", result: flagResult(true, ofsdk.DefaultReason), want: true},
		{name: "enabled percentage", result: flagResult(true, ofsdk.SplitReason), want: true},
		{name: "cached true", result: flagResult(true, ofsdk.CachedReason), wantErr: true},
		{name: "unknown true", result: flagResult(true, ofsdk.UnknownReason), wantErr: true},
		{name: "missing reason true", result: flagResult(true, ""), wantErr: true},
		{name: "stale true", result: flagResult(true, "STALE"), wantErr: true},
		{name: "default off", result: flagResult(false, ofsdk.DefaultReason)},
		{name: "disabled true default", result: flagResult(true, ofsdk.DisabledReason)},
		{name: "provider error with true value", result: providerError, wantErr: true},
		{name: "error reason without error code", result: flagResult(true, ofsdk.ErrorReason), wantErr: true},
		{name: "broken targeting default true", result: brokenRules, wantErr: true},
		{name: "malformed broken targeting metadata", result: brokenMetadata, wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			provider := &flagProvider{evaluate: func(_ context.Context, key string, fallback bool, _ ofsdk.FlattenedContext) ofsdk.BoolResolutionDetail {
				require.Equal(t, "ai-credits", key)
				require.False(t, fallback)
				return tc.result
			}}
			reporter := reporterWithFlagProvider(t, provider)
			value, err := reporter.BooleanValue(t.Context(), uuid.New(), "ai-credits")
			require.Equal(t, tc.want, value)
			require.Equal(t, tc.wantErr, err != nil)
			require.EqualValues(t, 1, provider.calls.Load())
		})
	}
}

func TestReporterBooleanValueUsesTargetOrganizationWithoutSelfExemptionsOrCache(t *testing.T) {
	source, target := uuid.New(), uuid.New()
	call := 0
	provider := &flagProvider{evaluate: func(_ context.Context, _ string, fallback bool, evaluationContext ofsdk.FlattenedContext) ofsdk.BoolResolutionDetail {
		call++
		expected := target
		if call == 4 {
			expected = source
		}
		require.Equal(t, ofsdk.FlattenedContext(dogfoodingctx.BuildContext(expected)), evaluationContext)
		require.False(t, fallback)
		switch call {
		case 1:
			return flagResult(true, ofsdk.TargetingMatchReason)
		case 3:
			result := flagResult(true, ofsdk.ErrorReason)
			result.ResolutionError = ofsdk.NewGeneralResolutionError("source unavailable")
			return result
		default:
			return flagResult(false, ofsdk.StaticReason)
		}
	}}
	reporter := reporterWithFlagProvider(t, provider)
	reporter.kaitenOrgID = source
	reporter.client.kaitenOrgID = source
	// This licence cache must have no bearing on a platform flag decision.
	reporter.configs.put(configKey{orgID: target, slug: "ai-credits"}, json.RawMessage(`true`))
	for index, org := range []uuid.UUID{target, target, target, source} {
		value, err := reporter.BooleanValue(t.Context(), org, "ai-credits")
		require.Equal(t, index == 0, value)
		require.Equal(t, index == 2, err != nil)
	}
	require.EqualValues(t, 4, provider.calls.Load(), "each operation must evaluate anew, including the source organization's own flags")
}

func TestReporterBooleanValueRejectsUnreadyClosedOrInvalidInputImmediately(t *testing.T) {
	provider := &flagProvider{evaluate: func(context.Context, string, bool, ofsdk.FlattenedContext) ofsdk.BoolResolutionDetail {
		return flagResult(true, ofsdk.StaticReason)
	}}
	ready := reporterWithFlagProvider(t, provider)
	closed := make(chan struct{})
	close(closed)
	for _, tc := range []struct {
		name     string
		reporter *Reporter
		org      uuid.UUID
		key      string
	}{
		{name: "nil reporter", org: uuid.New(), key: "ai-credits"},
		{name: "zero reporter", reporter: &Reporter{}, org: uuid.New(), key: "ai-credits"},
		{name: "initial token unready", reporter: &Reporter{ready: make(chan struct{})}, org: uuid.New(), key: "ai-credits"},
		{name: "missing OFREP client", reporter: &Reporter{client: &client{}, flagSourceReady: true}, org: uuid.New(), key: "ai-credits"},
		{name: "credential source unready", reporter: &Reporter{client: ready.client}, org: uuid.New(), key: "ai-credits"},
		{name: "closed with retained client", reporter: &Reporter{client: ready.client, flagSourceReady: true, closed: closed}, org: uuid.New(), key: "ai-credits"},
		{name: "nil organization", reporter: ready, org: uuid.Nil, key: "ai-credits"},
		{name: "empty flag key", reporter: ready, org: uuid.New()},
		{name: "blank flag key", reporter: ready, org: uuid.New(), key: "  "},
	} {
		t.Run(tc.name, func(t *testing.T) {
			returnsPromptly(t, func() {
				value, err := tc.reporter.BooleanValue(context.Background(), tc.org, tc.key)
				require.False(t, value)
				require.Error(t, err)
			})
		})
	}
	require.Zero(t, provider.calls.Load())
}

func TestReporterBooleanValueRejectsNonReadyProviderStates(t *testing.T) {
	for _, tc := range []struct {
		name  string
		event ofsdk.Event
		state ofsdk.State
	}{
		{name: "unready", event: ofsdk.Event{}, state: ofsdk.NotReadyState},
		{name: "stale", event: ofsdk.Event{EventType: ofsdk.ProviderStale}, state: ofsdk.StaleState},
		{name: "error", event: ofsdk.Event{EventType: ofsdk.ProviderError}, state: ofsdk.ErrorState},
		{name: "fatal", event: ofsdk.Event{EventType: ofsdk.ProviderError, ProviderEventDetails: ofsdk.ProviderEventDetails{ErrorCode: ofsdk.ProviderFatalCode}}, state: ofsdk.FatalState},
	} {
		t.Run(tc.name, func(t *testing.T) {
			provider := &flagProvider{
				events: make(chan ofsdk.Event, 1),
				evaluate: func(context.Context, string, bool, ofsdk.FlattenedContext) ofsdk.BoolResolutionDetail {
					return flagResult(true, ofsdk.StaticReason)
				},
			}
			reporter := reporterWithFlagProvider(t, provider)
			provider.events <- tc.event
			require.Eventually(t, func() bool { return reporter.client.ofClient.State() == tc.state }, time.Second, time.Millisecond)
			value, err := reporter.BooleanValue(t.Context(), uuid.New(), "ai-credits")
			require.False(t, value)
			require.ErrorIs(t, err, errNotReady)
			require.Zero(t, provider.calls.Load())
		})
	}
}

func TestReporterBooleanValueOFREPFailsClosed(t *testing.T) {
	for _, tc := range []struct {
		name    string
		status  int
		body    string
		want    bool
		wantErr bool
	}{
		{name: "true", status: http.StatusOK, body: `{"key":"ai-credits","value":true,"reason":"TARGETING_MATCH"}`, want: true},
		{name: "unknown true", status: http.StatusOK, body: `{"value":true,"reason":"UNKNOWN"}`, wantErr: true},
		{name: "missing reason true", status: http.StatusOK, body: `{"value":true}`, wantErr: true},
		{name: "cached true", status: http.StatusOK, body: `{"value":true,"reason":"CACHED"}`, wantErr: true},
		{name: "false", status: http.StatusOK, body: `{"value":false,"reason":"DEFAULT"}`},
		{name: "disabled default true", status: http.StatusOK, body: `{"value":true,"reason":"DISABLED"}`},
		{name: "absent", status: http.StatusNotFound, body: `{}`, wantErr: true},
		{name: "unauthenticated", status: http.StatusUnauthorized, body: `{}`, wantErr: true},
		{name: "unauthorized", status: http.StatusForbidden, body: `{}`, wantErr: true},
		{name: "provider unavailable", status: http.StatusServiceUnavailable, body: `{}`, wantErr: true},
		{name: "nonboolean string", status: http.StatusOK, body: `{"value":"true","reason":"STATIC"}`, wantErr: true},
		{name: "nonboolean number", status: http.StatusOK, body: `{"value":1,"reason":"STATIC"}`, wantErr: true},
		{name: "nonboolean object", status: http.StatusOK, body: `{"value":{},"reason":"STATIC"}`, wantErr: true},
		{name: "missing value", status: http.StatusOK, body: `{"reason":"STATIC"}`, wantErr: true},
		{name: "invalid json", status: http.StatusOK, body: `not-json`, wantErr: true},
		{name: "broken targeting", status: http.StatusOK, body: `{"value":true,"reason":"DEFAULT","metadata":{"kaiten.brokenTargetingRules":["invalid rule"]}}`, wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source, target := uuid.New(), uuid.New()
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
				calls.Add(1)
				require.Equal(t, http.MethodPost, request.Method)
				require.Equal(t, "/api/ofrep/v1/evaluate/flags/ai-credits", request.URL.Path)
				require.Equal(t, "Bearer token", request.Header.Get("Authorization"))
				var payload struct {
					Context map[string]any `json:"context"`
				}
				require.NoError(t, json.NewDecoder(request.Body).Decode(&payload))
				require.Equal(t, dogfoodingctx.BuildContext(target), payload.Context)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			t.Cleanup(server.Close)
			t.Cleanup(ofsdk.Shutdown)
			reporter := newConfigReporter(t, server.URL, source)
			value, err := reporter.BooleanValue(t.Context(), target, "ai-credits")
			require.Equal(t, tc.want, value)
			require.Equal(t, tc.wantErr, err != nil)
			require.EqualValues(t, 1, calls.Load())
		})
	}
}

func TestReporterBooleanValueBoundsEvaluationAndHonorsCancellation(t *testing.T) {
	t.Run("five second maximum", func(t *testing.T) {
		provider := &flagProvider{evaluate: func(ctx context.Context, _ string, _ bool, _ ofsdk.FlattenedContext) ofsdk.BoolResolutionDetail {
			deadline, ok := ctx.Deadline()
			require.True(t, ok)
			require.Greater(t, time.Until(deadline), evaluationTimeout-time.Second)
			require.LessOrEqual(t, time.Until(deadline), evaluationTimeout)
			return flagResult(true, ofsdk.StaticReason)
		}}
		reporter := reporterWithFlagProvider(t, provider)
		value, err := reporter.BooleanValue(context.Background(), uuid.New(), "ai-credits")
		require.NoError(t, err)
		require.True(t, value)
	})
	t.Run("earlier caller deadline", func(t *testing.T) {
		provider := &flagProvider{evaluate: func(ctx context.Context, _ string, _ bool, _ ofsdk.FlattenedContext) ofsdk.BoolResolutionDetail {
			<-ctx.Done()
			return flagResult(true, ofsdk.StaticReason) // A late true must not authorize.
		}}
		reporter := reporterWithFlagProvider(t, provider)
		ctx, cancel := context.WithTimeout(t.Context(), 20*time.Millisecond)
		defer cancel()
		started := time.Now()
		value, err := reporter.BooleanValue(ctx, uuid.New(), "ai-credits")
		require.False(t, value)
		require.ErrorIs(t, err, context.DeadlineExceeded)
		require.Less(t, time.Since(started), time.Second)
	})
	t.Run("cancelled before evaluation", func(t *testing.T) {
		provider := &flagProvider{evaluate: func(context.Context, string, bool, ofsdk.FlattenedContext) ofsdk.BoolResolutionDetail {
			return flagResult(true, ofsdk.StaticReason)
		}}
		reporter := reporterWithFlagProvider(t, provider)
		ctx, cancel := context.WithCancel(t.Context())
		cancel()
		value, err := reporter.BooleanValue(ctx, uuid.New(), "ai-credits")
		require.False(t, value)
		require.ErrorIs(t, err, context.Canceled)
		require.Zero(t, provider.calls.Load())
	})
}

func TestReporterBooleanValueCancelsOFREPRequest(t *testing.T) {
	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		// Drain the body so net/http can observe the cancelled connection while
		// the handler waits; otherwise the fixture itself stalls server.Close.
		_, _ = io.Copy(io.Discard, request.Body)
		close(started)
		<-request.Context().Done()
	}))
	t.Cleanup(server.Close)
	t.Cleanup(ofsdk.Shutdown)
	reporter := newConfigReporter(t, server.URL, uuid.New())
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	finished := make(chan error, 1)
	go func() {
		value, err := reporter.BooleanValue(ctx, uuid.New(), "ai-credits")
		if value {
			finished <- errors.New("cancelled request authorized the flag")
			return
		}
		finished <- err
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("OFREP request did not start")
	}
	cancel()
	select {
	case err := <-finished:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(time.Second):
		t.Fatal("OFREP evaluation did not honor cancellation")
	}
}

func TestReporterBooleanValueSourceFailureRetainsMeteringClientButNotFlagAuthority(t *testing.T) {
	for _, failure := range []string{"missing", "empty", "unreadable", "failed rotation"} {
		t.Run(failure, func(t *testing.T) {
			// Pure synthetic token files; registering OFREP does not call a server.
			tokenFile := filepath.Join(t.TempDir(), "synthetic-token")
			require.NoError(t, os.WriteFile(tokenFile, []byte("synthetic-token"), 0o600))
			reporter := &Reporter{cfg: Config{APIURL: "http://unused.invalid"}, tokenFile: tokenFile, ofDomain: t.Name(), ready: make(chan struct{})}
			reporter.reload()
			t.Cleanup(ofsdk.Shutdown)
			retained := reporter.currentClient()
			require.NotNil(t, retained)
			provider := &flagProvider{evaluate: func(context.Context, string, bool, ofsdk.FlattenedContext) ofsdk.BoolResolutionDetail {
				return flagResult(true, ofsdk.StaticReason)
			}}
			require.NoError(t, ofsdk.SetNamedProviderAndWait(reporter.ofDomain, provider))
			org := uuid.New()
			value, err := reporter.BooleanValue(t.Context(), org, "ai-credits")
			require.NoError(t, err)
			require.True(t, value)

			switch failure {
			case "missing":
				require.NoError(t, os.Remove(tokenFile))
			case "empty":
				require.NoError(t, os.WriteFile(tokenFile, []byte(" \n"), 0o600))
			case "unreadable":
				require.NoError(t, os.Remove(tokenFile))
				require.NoError(t, os.Mkdir(tokenFile, 0o700))
			case "failed rotation":
				reporter.cfg.APIURL = "" // Reject before any provider registration.
				require.NoError(t, os.WriteFile(tokenFile, []byte("new-synthetic-token"), 0o600))
			}
			reporter.reload()
			require.Same(t, retained, reporter.currentClient(), "metering keeps its previous client")
			value, err = reporter.BooleanValue(t.Context(), org, "ai-credits")
			require.False(t, value)
			require.ErrorIs(t, err, errNotReady)
			require.EqualValues(t, 1, provider.calls.Load(), "a retained client must not authorize after source loss")

			if failure == "unreadable" {
				require.NoError(t, os.Remove(tokenFile))
			}
			require.NoError(t, os.WriteFile(tokenFile, []byte("synthetic-token"), 0o600))
			reporter.reload()
			require.Same(t, retained, reporter.currentClient())
			value, err = reporter.BooleanValue(t.Context(), org, "ai-credits")
			require.NoError(t, err, "a readable unchanged token must recover without replacing the retained client")
			require.True(t, value)
			require.EqualValues(t, 2, provider.calls.Load())
		})
	}
}

func TestReporterBooleanValueRejectsAuthorityLostDuringEvaluation(t *testing.T) {
	for _, change := range []string{"credential source lost", "client rotated", "closed"} {
		t.Run(change, func(t *testing.T) {
			var reporter *Reporter
			provider := &flagProvider{evaluate: func(context.Context, string, bool, ofsdk.FlattenedContext) ofsdk.BoolResolutionDetail {
				switch change {
				case "credential source lost":
					reporter.mu.Lock()
					reporter.flagSourceReady = false
					reporter.mu.Unlock()
				case "client rotated":
					reporter.mu.Lock()
					reporter.client = &client{ofClient: reporter.client.ofClient}
					reporter.mu.Unlock()
				case "closed":
					close(reporter.closed)
				}
				return flagResult(true, ofsdk.StaticReason)
			}}
			reporter = reporterWithFlagProvider(t, provider)
			value, err := reporter.BooleanValue(t.Context(), uuid.New(), "ai-credits")
			require.False(t, value)
			require.True(t, errors.Is(err, errNotReady))
		})
	}
}
