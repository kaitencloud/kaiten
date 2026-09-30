package dogfooding

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/pkg/secretfile"
)

const (
	tokenPollInterval   = time.Second
	reportWorkerCount   = 4
	reportQueueCapacity = 64 // Burst buffer only; submissions block instead of dropping when full.

	// asyncJobTimeout bounds one queued async job end-to-end, including the
	// time it may spend in awaitClient waiting for a service token that
	// hasn't arrived yet — the seeder writes KAITEN_METERED_TOKEN_FILE
	// asynchronously, after this process is already serving traffic (see
	// config.Config's own doc comment), so waiting is expected. Without
	// this bound, a worker stuck on a token that never arrives (a real
	// misconfiguration, not just "not written yet") never returns to drain
	// the next queued job; with all reportWorkerCount workers stuck and
	// the queue permanently full, TrackAsync/DecrementAsync — called
	// synchronously from HTTP handlers — would then block every caller
	// forever instead of for at most this long per stuck job.
	asyncJobTimeout = 20 * time.Second
)

// unreadyWarnAfter is how long a Reporter tolerates having no service token
// before logging once, loudly, that reporting is stalled. Well above any
// realistic seeder-provisioning window, so it fires only for what's
// actually a misconfiguration an operator should notice. A var (not a
// const) so tests can shrink it instead of waiting out the real interval.
var unreadyWarnAfter = 2 * time.Minute

type reportJob func(context.Context) error

type workerPool struct {
	mu       sync.Mutex
	notEmpty *sync.Cond
	notFull  *sync.Cond
	jobs     []reportJob
	head     int
	size     int
	closed   bool
	workers  sync.WaitGroup
}

func newWorkerPool(ctx context.Context, workers, queueCapacity int) *workerPool {
	if workers <= 0 {
		panic("dogfooding: worker count must be positive")
	}
	if queueCapacity <= 0 {
		panic("dogfooding: report queue capacity must be positive")
	}

	p := &workerPool{
		jobs: make([]reportJob, queueCapacity),
	}
	p.notEmpty = sync.NewCond(&p.mu)
	p.notFull = sync.NewCond(&p.mu)
	workerCtx := context.WithoutCancel(ctx)
	for range workers {
		p.workers.Add(1)
		go func() {
			defer p.workers.Done()
			for {
				job, ok := p.next()
				if !ok {
					return
				}
				if err := job(workerCtx); err != nil {
					slog.Error("failed to report usage asynchronously", "error", err)
				}
			}
		}()
	}
	return p
}

func (p *workerPool) submit(job reportJob) bool {
	p.mu.Lock()
	defer p.mu.Unlock()

	for p.size == len(p.jobs) && !p.closed {
		p.notFull.Wait()
	}
	if p.closed {
		return false
	}
	p.jobs[(p.head+p.size)%len(p.jobs)] = job
	p.size++
	p.notEmpty.Signal()
	return true
}

func (p *workerPool) next() (reportJob, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()

	for p.size == 0 && !p.closed {
		p.notEmpty.Wait()
	}
	if p.size == 0 {
		return nil, false
	}

	job := p.jobs[p.head]
	p.jobs[p.head] = nil
	p.head = (p.head + 1) % len(p.jobs)
	p.size--
	p.notFull.Signal()
	return job, true
}

func (p *workerPool) close() {
	p.mu.Lock()
	p.closed = true
	p.notEmpty.Broadcast()
	p.notFull.Broadcast()
	p.mu.Unlock()

	p.workers.Wait()
}

// Reporter watches a service-token file and atomically replaces its token-bound
// client whenever the secret rotates. When reporting is enabled, asynchronous
// reports wait in a bounded queue until a valid token is available.
type Reporter struct {
	cancel        context.CancelFunc
	closeOnce     sync.Once
	readyOnce     sync.Once
	unreadyWarned sync.Once
	startedAt     time.Time
	mu            sync.RWMutex
	client        *client
	cfg           Config
	kaitenOrgID   uuid.UUID
	tokenFile     string
	lastToken     string
	workers       *workerPool
	ready         chan struct{}
	closed        chan struct{}
	watchDone     chan struct{}
}

// NewReporter creates a rotating reporter and starts its watcher immediately.
// The token is intentionally accepted only through a file so every deployment
// supports secret rotation without restarting the process.
func NewReporter(ctx context.Context, cfg Config, tokenFile string) (*Reporter, error) {
	tokenFile = strings.TrimSpace(tokenFile)
	if tokenFile == "" {
		return nil, fmt.Errorf("dogfooding token file is required")
	}
	if err := validateConfig(cfg); err != nil {
		return nil, err
	}
	kaitenOrgID, err := parseOrgID(cfg.OrgID)
	if err != nil {
		return nil, err
	}

	lifecycleCtx, cancel := context.WithCancel(ctx)
	r := &Reporter{
		cancel:      cancel,
		cfg:         cfg,
		kaitenOrgID: kaitenOrgID,
		tokenFile:   tokenFile,
		startedAt:   time.Now(),
		ready:       make(chan struct{}),
		closed:      make(chan struct{}),
		watchDone:   make(chan struct{}),
	}
	r.workers = newWorkerPool(lifecycleCtx, reportWorkerCount, reportQueueCapacity)
	r.reload()
	go r.watch(lifecycleCtx)
	go func() {
		<-lifecycleCtx.Done()
		r.Close()
	}()
	return r, nil
}

// Close stops token watching and drains every accepted asynchronous report.
func (r *Reporter) Close() {
	r.closeOnce.Do(func() {
		r.cancel()
		<-r.watchDone
		close(r.closed)
		r.workers.close()
	})
}

func (r *Reporter) watch(ctx context.Context) {
	defer close(r.watchDone)

	ticker := time.NewTicker(tokenPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.reload()
			r.warnIfStillUnready()
		}
	}
}

// warnIfStillUnready logs once, at Warn level, if no service token has
// become available within unreadyWarnAfter of construction. A no-op once a
// token has ever loaded (r.ready is closed by reload) or once already
// logged — this is a one-time operator signal, not a repeating alarm.
func (r *Reporter) warnIfStillUnready() {
	select {
	case <-r.ready:
		return
	default:
	}

	if time.Since(r.startedAt) < unreadyWarnAfter {
		return
	}

	r.unreadyWarned.Do(func() {
		slog.Warn(
			"dogfooding: no service token available after prolonged wait; usage reporting and threshold enforcement are stalled",
			"file", r.tokenFile,
			"waited", time.Since(r.startedAt).Round(time.Second),
		)
	})
}

func (r *Reporter) reload() {
	if r.tokenFile == "" {
		return
	}

	serviceToken, err := secretfile.Read(r.tokenFile)
	if err != nil {
		// A missing file is the expected state and stays silent: the credential
		// is minted by a later step and this loop is what waits for it.
		//
		// Anything else means the file is THERE and this process cannot read it
		// -- a wrong owner on the mount, a directory where a file should be --
		// and that is Error, not Warn. Reporting is fail-closed, so the process
		// keeps serving and looks healthy; the only symptom is metered creates
		// eventually timing out. At LOG_LEVEL=error, which the local stack and
		// production both run, a Warn here is invisible, and a fleet whose
		// credential handoff is broken is indistinguishable from a working one.
		// A credential the process cannot read is not a warning.
		if !os.IsNotExist(err) {
			slog.Error("dogfooding: read token file", "file", r.tokenFile, "error", err)
		}
		return
	}
	if serviceToken == "" {
		return
	}

	r.mu.RLock()
	isUnchanged := serviceToken == r.lastToken
	r.mu.RUnlock()
	if isUnchanged {
		return
	}

	client, err := newClient(r.cfg, serviceToken)
	if err != nil {
		slog.Error("dogfooding: initialize rotated reporter", "error", err)
		return
	}

	r.mu.Lock()
	r.client = client
	r.lastToken = serviceToken
	r.mu.Unlock()
	r.readyOnce.Do(func() {
		close(r.ready)
	})
	slog.Info("dogfooding: reporter initialized from token file", "file", r.tokenFile)
}

func (r *Reporter) currentClient() *client {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.client
}

func (r *Reporter) awaitClient(ctx context.Context) (*client, error) {
	if client := r.currentClient(); client != nil {
		return client, nil
	}

	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("wait for dogfooding service token: %w", ctx.Err())
	case <-r.closed:
		return nil, fmt.Errorf("wait for dogfooding service token: reporter closed")
	case <-r.ready:
	}

	client := r.currentClient()
	if client == nil {
		return nil, fmt.Errorf("wait for dogfooding service token: reporter initialized without a client")
	}
	return client, nil
}

// TrackAsync fires a +1 usage report in the background.
func (r *Reporter) TrackAsync(orgID uuid.UUID, entitlementSlug string) {
	r.runAsync(orgID, entitlementSlug, func(ctx context.Context) error {
		return r.ReportAndEnforce(ctx, orgID, entitlementSlug)
	})
}

func (r *Reporter) runAsync(orgID uuid.UUID, entitlementSlug string, report func(context.Context) error) {
	if r.shouldSkip(orgID, entitlementSlug) {
		return
	}
	if !r.workers.submit(func(ctx context.Context) error {
		jobCtx, cancel := context.WithTimeout(ctx, asyncJobTimeout)
		defer cancel()
		if err := report(jobCtx); err != nil {
			return fmt.Errorf("organization %s entitlement %q: %w", orgID, entitlementSlug, err)
		}
		return nil
	}) {
		slog.Warn(
			"dogfooding: reporter is closed",
			"organization_id", orgID,
			"entitlement_slug", entitlementSlug,
		)
	}
}

// DecrementAsync fires a -1 usage report in the background.
func (r *Reporter) DecrementAsync(orgID uuid.UUID, entitlementSlug string) {
	r.runAsync(orgID, entitlementSlug, func(ctx context.Context) error {
		return r.Decrement(ctx, orgID, entitlementSlug)
	})
}

// Decrement synchronously reports a -1 usage delta using the latest valid token.
func (r *Reporter) Decrement(ctx context.Context, orgID uuid.UUID, entitlementSlug string) error {
	if r.shouldSkip(orgID, entitlementSlug) {
		return nil
	}
	client, err := r.awaitClient(ctx)
	if err != nil {
		return err
	}
	return client.Decrement(ctx, orgID, entitlementSlug)
}

// ReportAndEnforce synchronously reports usage using the latest valid token.
func (r *Reporter) ReportAndEnforce(ctx context.Context, orgID uuid.UUID, entitlementSlug string) error {
	if r.shouldSkip(orgID, entitlementSlug) {
		return nil
	}
	client, err := r.awaitClient(ctx)
	if err != nil {
		return err
	}
	return client.ReportAndEnforce(ctx, orgID, entitlementSlug)
}

// shouldSkip reports whether this call has nothing to meter: no entitlement
// named, or the caller is the reporting deployment's own organization.
func (r *Reporter) shouldSkip(orgID uuid.UUID, entitlementSlug string) bool {
	if strings.TrimSpace(entitlementSlug) == "" {
		return true
	}
	return r.kaitenOrgID != uuid.Nil && orgID == r.kaitenOrgID
}
