package dogfooding

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/open-feature/go-sdk/openfeature"
	"github.com/stretchr/testify/require"
)

func TestReporterReload(t *testing.T) {
	t.Cleanup(openfeature.Shutdown)

	tokenFile := filepath.Join(t.TempDir(), "service-token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("first-token"), 0o600))

	reporter, err := NewReporter(t.Context(), Config{
		APIURL: "http://example.com",
		OrgID:  uuid.NewString(),
	}, tokenFile)
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	require.Equal(t, "first-token", reporter.lastToken)
	firstClient := reporter.currentClient()
	require.NotNil(t, firstClient)

	require.NoError(t, os.WriteFile(tokenFile, []byte("second-token"), 0o600))
	reporter.reload()
	require.Equal(t, "second-token", reporter.lastToken)
	require.NotSame(t, firstClient, reporter.currentClient())

	require.NoError(t, os.WriteFile(tokenFile, nil, 0o600))
	reporter.reload()
	require.Equal(t, "second-token", reporter.lastToken, "empty rotations must retain the last valid client")
}

func TestReporterUsesRotatedToken(t *testing.T) {
	authorizations := make(chan string, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorizations <- r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	tokenFile := filepath.Join(t.TempDir(), "service-token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("first-token"), 0o600))
	reporter, err := NewReporter(t.Context(), Config{
		APIURL: server.URL,
		OrgID:  uuid.NewString(),
	}, tokenFile)
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	targetOrganizationID := uuid.New()
	require.NoError(t, reporter.Decrement(t.Context(), targetOrganizationID, "entitlement"))
	require.Equal(t, "Bearer first-token", <-authorizations)

	require.NoError(t, os.WriteFile(tokenFile, []byte("second-token"), 0o600))
	reporter.reload()
	require.NoError(t, reporter.Decrement(t.Context(), targetOrganizationID, "entitlement"))
	require.Equal(t, "Bearer second-token", <-authorizations)
}

func TestReporterWatchesTokenFileForRotation(t *testing.T) {
	tokenFile := filepath.Join(t.TempDir(), "service-token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("first-token"), 0o600))
	reporter, err := NewReporter(t.Context(), Config{
		APIURL: "http://example.com",
		OrgID:  uuid.NewString(),
	}, tokenFile)
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	require.NoError(t, os.WriteFile(tokenFile, []byte("second-token"), 0o600))
	require.Eventually(t, func() bool {
		reporter.mu.RLock()
		defer reporter.mu.RUnlock()
		return reporter.lastToken == "second-token"
	}, 3*time.Second, 50*time.Millisecond)
}

func TestNewReporterRejectsInvalidConfig(t *testing.T) {
	tests := []struct {
		name      string
		cfg       Config
		tokenFile string
	}{
		{name: "missing token file", cfg: Config{APIURL: "http://example.com", OrgID: uuid.NewString()}},
		{name: "missing api url", cfg: Config{OrgID: uuid.NewString()}, tokenFile: "token"},
		{name: "invalid organization id", cfg: Config{APIURL: "http://example.com", OrgID: "invalid"}, tokenFile: "token"},
		{name: "nil organization id", cfg: Config{APIURL: "http://example.com", OrgID: uuid.Nil.String()}, tokenFile: "token"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reporter, err := NewReporter(t.Context(), tt.cfg, tt.tokenFile)
			require.Error(t, err)
			require.Nil(t, reporter)
		})
	}
}

func TestReporterQueuesReportsUntilInitialTokenIsAvailable(t *testing.T) {
	tokenFile := filepath.Join(t.TempDir(), "service-token")
	reporter, err := NewReporter(t.Context(), Config{
		APIURL: "http://example.com",
		OrgID:  uuid.NewString(),
	}, tokenFile)
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	completed := make(chan struct{})
	reporter.runAsync(uuid.New(), "entitlement", func(ctx context.Context) error {
		if _, err := reporter.awaitClient(ctx); err != nil {
			return err
		}
		close(completed)
		return nil
	})

	select {
	case <-completed:
		t.Fatal("report completed before a token became available")
	case <-time.After(50 * time.Millisecond):
	}

	require.NoError(t, os.WriteFile(tokenFile, []byte("first-token"), 0o600))
	reporter.reload()

	select {
	case <-completed:
	case <-time.After(time.Second):
		t.Fatal("queued report did not resume after token initialization")
	}
}

func TestReporterWaitForTokenHonorsContext(t *testing.T) {
	reporter, err := NewReporter(t.Context(), Config{
		APIURL: "http://example.com",
		OrgID:  uuid.NewString(),
	}, filepath.Join(t.TempDir(), "missing-token"))
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	ctx, cancel := context.WithTimeout(t.Context(), 20*time.Millisecond)
	defer cancel()

	err = reporter.ReportAndEnforce(ctx, uuid.New(), "entitlement")

	require.Error(t, err)
	require.True(t, errors.Is(err, context.DeadlineExceeded))
}

func TestReporterSkipsKaitenOrganizationWithoutInitialToken(t *testing.T) {
	kaitenOrganizationID := uuid.New()
	reporter, err := NewReporter(t.Context(), Config{
		APIURL: "http://example.com",
		OrgID:  kaitenOrganizationID.String(),
	}, filepath.Join(t.TempDir(), "missing-token"))
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	require.NoError(t, reporter.ReportAndEnforce(t.Context(), kaitenOrganizationID, "entitlement"))
	require.NoError(t, reporter.Decrement(t.Context(), kaitenOrganizationID, "entitlement"))
	reporter.TrackAsync(kaitenOrganizationID, "entitlement")
	reporter.DecrementAsync(kaitenOrganizationID, "entitlement")
}

func TestReporterCloseDeliversAllAcceptedAsyncReports(t *testing.T) {
	const reportCount = reportQueueCapacity + reportWorkerCount + 20

	var delivered atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		delivered.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)

	tokenFile := filepath.Join(t.TempDir(), "service-token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("service-token"), 0o600))
	reporter, err := NewReporter(t.Context(), Config{
		APIURL: server.URL,
		OrgID:  uuid.NewString(),
	}, tokenFile)
	require.NoError(t, err)

	targetOrganizationID := uuid.New()
	for range reportCount {
		reporter.DecrementAsync(targetOrganizationID, "entitlement")
	}
	reporter.Close()

	require.EqualValues(t, reportCount, delivered.Load())
}

func TestWorkerPoolAppliesBackpressure(t *testing.T) {
	pool := newWorkerPool(t.Context(), 1, 1)
	t.Cleanup(pool.close)

	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	require.True(t, pool.submit(func(context.Context) error {
		close(firstStarted)
		<-releaseFirst
		return nil
	}))
	<-firstStarted

	require.True(t, pool.submit(func(context.Context) error {
		return nil
	}))

	submitted := make(chan bool, 1)
	go func() {
		submitted <- pool.submit(func(context.Context) error {
			return nil
		})
	}()

	select {
	case <-submitted:
		t.Fatal("submit returned while the worker and queue were both occupied")
	case <-time.After(50 * time.Millisecond):
	}

	close(releaseFirst)
	require.True(t, <-submitted)
}

func TestWorkerPoolCloseDrainsAcceptedJobs(t *testing.T) {
	const reportCount = 32

	pool := newWorkerPool(t.Context(), 4, 4)
	var completed atomic.Int32
	for range reportCount {
		require.True(t, pool.submit(func(context.Context) error {
			completed.Add(1)
			return nil
		}))
	}

	pool.close()

	require.EqualValues(t, reportCount, completed.Load())
	require.False(t, pool.submit(func(context.Context) error {
		return nil
	}))
}

func TestWorkerPoolConcurrentSubmitAndClose(t *testing.T) {
	pool := newWorkerPool(t.Context(), 4, 4)

	var submitters sync.WaitGroup
	for range 32 {
		submitters.Go(func() {
			pool.submit(func(context.Context) error {
				return nil
			})
		})
	}

	pool.close()
	submitters.Wait()
}

func TestRunAsyncBoundsJobContext(t *testing.T) {
	reporter, err := NewReporter(t.Context(), Config{
		APIURL: "http://example.com",
		OrgID:  uuid.NewString(),
	}, filepath.Join(t.TempDir(), "missing-token"))
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	deadlineSeen := make(chan time.Time, 1)
	reporter.runAsync(uuid.New(), "entitlement", func(ctx context.Context) error {
		deadline, ok := ctx.Deadline()
		require.True(t, ok, "runAsync must bound the job context passed to report -- "+
			"otherwise a stuck awaitClient (waiting on a token that never arrives) "+
			"blocks the worker forever, and with every worker stuck the queue never "+
			"drains, blocking every future TrackAsync/DecrementAsync caller too")
		deadlineSeen <- deadline
		return nil
	})

	select {
	case deadline := <-deadlineSeen:
		require.WithinDuration(t, time.Now().Add(asyncJobTimeout), deadline, 2*time.Second)
	case <-time.After(time.Second):
		t.Fatal("job never ran")
	}
}

func TestWarnIfStillUnready(t *testing.T) {
	originalThreshold := unreadyWarnAfter
	unreadyWarnAfter = 20 * time.Millisecond
	t.Cleanup(func() { unreadyWarnAfter = originalThreshold })

	var buf bytes.Buffer
	originalLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(originalLogger) })

	reporter, err := NewReporter(t.Context(), Config{
		APIURL: "http://example.com",
		OrgID:  uuid.NewString(),
	}, filepath.Join(t.TempDir(), "missing-token"))
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	reporter.warnIfStillUnready()
	require.NotContains(t, buf.String(), "prolonged wait", "must not warn before the threshold elapses")

	require.Eventually(t, func() bool {
		reporter.warnIfStillUnready()
		return strings.Contains(buf.String(), "prolonged wait")
	}, time.Second, 5*time.Millisecond)

	countAfterFirstWarning := strings.Count(buf.String(), "prolonged wait")
	for range 5 {
		reporter.warnIfStillUnready()
	}
	require.Equal(t, countAfterFirstWarning, strings.Count(buf.String(), "prolonged wait"),
		"must warn at most once, no matter how many times watch() calls it afterward")
}

func TestWarnIfStillUnready_NoOpOnceReady(t *testing.T) {
	unreadyWarnAfter = 0 // would fire immediately if the ready-channel short-circuit didn't work
	t.Cleanup(func() { unreadyWarnAfter = 2 * time.Minute })

	var buf bytes.Buffer
	originalLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(originalLogger) })

	tokenFile := filepath.Join(t.TempDir(), "service-token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("token"), 0o600))

	reporter, err := NewReporter(t.Context(), Config{
		APIURL: "http://example.com",
		OrgID:  uuid.NewString(),
	}, tokenFile)
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	reporter.warnIfStillUnready()

	require.NotContains(t, buf.String(), "prolonged wait",
		"must never warn once a token has loaded, regardless of the threshold")
}

// An unreadable token file is a fail-closed condition that leaves the process
// looking healthy, so the log line is the only symptom -- and at LOG_LEVEL=error
// a Warn would not appear at all. A directory in place of the file reproduces
// "there, but unreadable" deterministically, unlike a chmod, which root ignores.
func TestReloadLogsAnUnreadableTokenFileAtError(t *testing.T) {
	var buf bytes.Buffer
	originalLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelError})))
	t.Cleanup(func() { slog.SetDefault(originalLogger) })

	// A directory, not a file: os.ReadFile fails with EISDIR, which is not
	// os.IsNotExist, which is exactly the case that must be loud.
	tokenFile := filepath.Join(t.TempDir(), "service-token")
	require.NoError(t, os.Mkdir(tokenFile, 0o700))

	reporter, err := NewReporter(t.Context(), Config{
		APIURL: "http://example.com",
		OrgID:  uuid.NewString(),
	}, tokenFile)
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	buf.Reset()
	reporter.reload()

	require.Contains(t, buf.String(), "dogfooding: read token file",
		"an unreadable token file must be visible at LOG_LEVEL=error")
	require.Contains(t, buf.String(), "level=ERROR")
}

// The other half of the same policy: a token file that is simply not there yet
// is the expected state -- the credential is minted by a later step -- and must
// stay silent at every level, or every fleet logs on every tick until it lands.
func TestReloadIsSilentWhenTheTokenFileDoesNotExist(t *testing.T) {
	var buf bytes.Buffer
	originalLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(originalLogger) })

	reporter, err := NewReporter(t.Context(), Config{
		APIURL: "http://example.com",
		OrgID:  uuid.NewString(),
	}, filepath.Join(t.TempDir(), "missing-token"))
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	buf.Reset()
	reporter.reload()

	require.NotContains(t, buf.String(), "read token file",
		"a credential that has not been minted yet is not a problem to report")
}

func TestWorkerPoolCloseUnblocksSaturatedSubmitters(t *testing.T) {
	pool := newWorkerPool(t.Context(), 1, 1)

	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	require.True(t, pool.submit(func(context.Context) error {
		close(firstStarted)
		<-releaseFirst
		return nil
	}))
	<-firstStarted

	require.True(t, pool.submit(func(context.Context) error {
		return nil
	}))

	submitted := make(chan bool, 1)
	go func() {
		submitted <- pool.submit(func(context.Context) error {
			return nil
		})
	}()

	closed := make(chan struct{})
	go func() {
		pool.close()
		close(closed)
	}()

	select {
	case accepted := <-submitted:
		require.False(t, accepted)
	case <-time.After(time.Second):
		t.Fatal("close did not unblock a saturated submitter")
	}
	close(releaseFirst)
	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("close did not drain the worker pool")
	}
}

// TestReporter_ShouldSkipWithNoConfiguredOrganization is the guard on the
// relaxation that let a standalone fleet stop carrying an organization id.
//
// It matters more than a nil check normally would, because a skip is reported as
// success: shouldSkip true makes ReportAndEnforce return nil, which
// EnforceCreationLimit reads as allowed. So a Reporter that treated "no
// organization configured" as "the caller is me" would exempt whoever arrived
// with an unresolved id from both metering and gating, and log nothing.
func TestReporter_ShouldSkipWithNoConfiguredOrganization(t *testing.T) {
	reporter := &Reporter{}

	if reporter.kaitenOrgID != uuid.Nil {
		t.Fatalf("kaitenOrgID = %s, want the nil uuid for a Reporter configured with no organization", reporter.kaitenOrgID)
	}
	if reporter.shouldSkip(uuid.New(), "customers") {
		t.Fatalf("shouldSkip(some org) = true, want false — with no organization configured there is nothing to skip")
	}
	if !reporter.shouldSkip(uuid.New(), "") {
		t.Fatalf("shouldSkip(no entitlement) = false, want true — an unnamed entitlement has no meter either way")
	}
	if reporter.shouldSkip(uuid.Nil, "customers") {
		t.Fatalf("shouldSkip(nil org) = true, want false — a caller whose id failed to resolve must not be exempted by matching the sentinel")
	}
}

// TestReporter_ShouldSkipItsOwnOrganization keeps the behaviour the field exists
// for: the deployment that meters itself does not bill itself.
func TestReporter_ShouldSkipItsOwnOrganization(t *testing.T) {
	own := uuid.New()
	reporter := &Reporter{kaitenOrgID: own}

	if !reporter.shouldSkip(own, "customers") {
		t.Fatalf("shouldSkip(own org) = false, want true")
	}
	if reporter.shouldSkip(uuid.New(), "customers") {
		t.Fatalf("shouldSkip(another org) = true, want false")
	}
}
