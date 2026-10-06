package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humafiber"
	"github.com/gofiber/contrib/v3/otel"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/healthcheck"
	fiberrecover "github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	slogfiber "github.com/samber/slog-fiber"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/builtinconnectors"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	httpapi "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/api"
	graphqlHandler "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/retention"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/attio"
	"github.com/kaitencloud/kaiten/api/internal/platform/auth"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/platform/jit"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
)

type Dependencies struct {
	// Auth authenticates the CORE listener. It accepts organization credentials
	// and cannot produce a platform principal -- see internal/platform/auth.
	Auth auth.Middleware
	// PlatformAuth overrides the PLATFORM listener's authenticator, and exists for
	// tests that need to stand in for a credential rather than present one.
	PlatformAuth auth.Middleware
	UserProvider currentuser.Provider
	// ConnectorEntitlements answers whether an organization's licence includes a
	// connector. Left nil in production and filled by setupUsageReporter, which is
	// where the connection to the licensing deployment is built; a test may set it
	// to stand in for that deployment.
	ConnectorEntitlements services.ConnectorEntitlements
	// EntitlementConfig reads the settings an organization's licence states. Left
	// nil in production and filled by setupUsageReporter alongside
	// ConnectorEntitlements, for the same reason; a test may set it.
	EntitlementConfig services.EntitlementConfig
	DB                *pgxpool.Pool
	Logger            *slog.Logger
	UsageReporter     services.UsageReporter
}

// Server runs two HTTP stacks in one process.
//
// The Core stack is the public one: every tenant operation, GraphQL, the ext_authz
// token-validation route, the probes. The Platform stack is internal: /api/platform
// and its OpenAPI document, nothing else. They share every service, repository and
// worker below the transport -- one application object, one database pool, one set
// of background jobs -- and share nothing above it: separate Fiber apps, separate
// huma APIs, separate authentication middleware, separate ports.
//
// The split is not about scaling. It answers "what stops a platform credential
// working on a tenant route": neither the routes nor the middleware that verifies
// the credential are on that listener. A path predicate can be got wrong by a new
// route; a second socket cannot.
type Server struct {
	// router is the Core (public) Fiber app, and api the huma API mounted on its
	// /api group.
	router    *fiber.App
	api       huma.API
	apiConfig huma.Config

	// platformRouter is the Platform (internal) Fiber app and platformAPI the huma
	// API mounted on ITS /api group -- a different app on a different port, which is
	// the whole boundary. Operation paths still carry the /platform prefix, so the
	// URLs internal callers already use are unchanged; only the port they are
	// addressed on is.
	platformRouter *fiber.App
	platformAPI    huma.API
	platformConfig huma.Config

	deps Dependencies
	cfg  config.Config

	// app is the constructed application: every module, every background worker
	// this process runs, and one shutdown to drain them. This server builds it
	// (setupApp) and registers endpoints from it (registerModules); it does not
	// assemble the object graph itself.
	app *kaiten.Kaiten

	// ready latches true the first time the readiness probe finds this process fit
	// to serve: the database schema current, and the connectors this binary ships
	// registered. Both only ever move forward — the schema version is installed
	// out-of-band by kaiten-admin-tools and never rolls back, and a registration is
	// a committed row — so once observed the latch turns the steady-state readyz
	// check into an atomic load instead of a DB round trip on every probe.
	ready atomic.Bool

	// startupMu serialises the work behind that latch, so a burst of probes against
	// a process that is not ready yet does one round of it rather than one round per
	// probe. Not a sync.Once: the work legitimately fails against a database that
	// has not been migrated yet, and the next probe has to try again.
	startupMu sync.Mutex
}

func New(ctx context.Context, deps Dependencies, cfg config.Config) (*Server, error) {
	if deps.Auth != nil && deps.DB == nil {
		return nil, fmt.Errorf("auth middleware requires a database connection for JIT provisioning")
	}
	// A server that authenticates its public listener and not its internal one is
	// not refused here, it is unconstructable: setupPlatformRoutes builds the
	// platform authenticator whenever the application has one to build it from.
	// See Dependencies.PlatformAuth.

	s := &Server{
		deps: deps,
		cfg:  cfg,
	}
	if err := s.setupApp(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Server) setupApp(ctx context.Context) error {
	s.router = s.newRouter()
	s.platformRouter = s.newRouter()

	// Fiber v3's healthcheck middleware does not match paths itself, so each
	// probe is a plain handler mounted at its own route.
	s.router.Get("/api/healthz", healthcheck.New())
	s.router.Get("/api/readyz", healthcheck.New(healthcheck.Config{
		Probe: s.readinessProbe,
	}))

	if err := s.setupUsageReporter(ctx); err != nil {
		return err
	}

	// The application is built before the transport, not by it. It has to happen
	// here rather than in registerModules because the retention sweep below
	// registers its stop hook on it and starts before any module does.
	if err := s.setupApplication(); err != nil {
		return err
	}
	if err := s.registerBuiltInConnectorsIfMigrated(ctx); err != nil {
		return err
	}
	s.setupRetention(ctx)

	s.setupAPI()
	s.setupRoutes()
	return nil
}

// The socket-level budgets both listeners run under. fasthttp's zero value is no
// deadline at all, and at replicaCount 1 a handful of stuck connections is the
// whole service.
//
// writeTimeout is a constraint rather than a judgement call: it must outlast the
// GraphQL operation budget, or Fiber cuts the connection while gqlgen is still
// writing the refusal that budget produced and the client sees a dropped socket
// instead of an error. Derived from that budget rather than set beside it, so
// raising one cannot leave the other behind.
const (
	readTimeout  = 15 * time.Second
	writeTimeout = 2 * graphqlHandler.OperationTimeout
	idleTimeout  = 120 * time.Second
)

// newRouter builds one Fiber app with the middleware every listener in this
// process has: the same error handler, the same panic recovery, the same tracing
// and the same request log. Both listeners are the same service, and an operator
// reading the logs should not be able to tell which port a line came from by the
// shape of the line.
//
// What it deliberately does NOT install is anything that authenticates or
// authorizes. That is the difference between the two stacks, and it is applied per
// listener in setupCoreRoutes and setupPlatformRoutes, where it is visible.
func (s *Server) newRouter() *fiber.App {
	app := fiber.New(fiber.Config{
		ErrorHandler:   fiberapi.SetErrorHandler(),
		ReadBufferSize: 32768,
		ReadTimeout:    readTimeout,
		WriteTimeout:   writeTimeout,
		IdleTimeout:    idleTimeout,
	})

	// Panic recovery — must be first so it wraps all subsequent middleware/handlers
	app.Use(fiberrecover.New(fiberrecover.Config{
		EnableStackTrace: true,
		StackTraceHandler: func(c fiber.Ctx, e any) {
			slog.ErrorContext(
				c.Context(), "panic recovered",
				slog.Any("panic", e),
				slog.String("method", c.Method()),
				slog.String("path", c.Path()),
			)
		},
	}))

	// OpenTelemetry middleware for HTTP request tracing — must run before slogfiber
	// so the active span is in context when slogfiber reads trace_id/span_id.
	// The Kaiten-TraceId response header is now Envoy's job (an
	// EnvoyExtensionPolicy Lua filter reads/propagates the W3C traceparent
	// this middleware's context extraction also relies on) — see
	// charts/kaiten/templates/ingress/trace-id-policy.yaml and
	// docker/envoy/kaiten*.yaml.tmpl. This middleware now only needs to
	// establish the active span for slogfiber and the rest of the request.
	app.Use(otel.Middleware())

	if s.deps.Logger != nil {
		app.Use(slogfiber.NewWithConfig(s.deps.Logger, slogfiber.Config{
			DefaultLevel:     slog.LevelInfo,
			ClientErrorLevel: slog.LevelWarn,
			ServerErrorLevel: slog.LevelError,
			// These two do nothing and cannot: slog-fiber looks the span up on the
			// fiber Ctx, and fiber v3 resolves Ctx.Value against fasthttp user
			// values rather than the context otel.Middleware stored it on. Left on
			// because they cost nothing. The ids arrive anyway -- otelcommon's
			// handler unwraps the Ctx before its own lookup.
			WithSpanID:         true,
			WithTraceID:        true,
			WithRequestID:      true,
			WithRequestBody:    false,
			WithRequestHeader:  false,
			WithResponseBody:   false,
			WithResponseHeader: false,
			// The probes are noise. The notification stream is something else:
			// this middleware logs a response's length, which it gets by
			// calling Response.Body() -- and on a streaming response that reads
			// the body to completion. An SSE stream never completes, so logging
			// it does not produce a late log line, it DEADLOCKS the request
			// before a single byte reaches the client. Found by watching a
			// stream hang with no headers and no log line at all.
			Filters: []slogfiber.Filter{
				slogfiber.IgnorePath("/api/healthz", "/api/readyz", notificationStreamPath),
			},
		}))
	}

	return app
}

// setupApplication constructs the application this server is a transport for.
//
// Everything this server knows about wiring is in this one call. What each module
// needs, which of them own background work, and where a LISTEN connection comes
// from are internal/kaiten's questions now; this function's job is to answer the
// three that are genuinely the transport's -- who is acting (the request context),
// whether this process is a server or the docs generator (a pool or nothing), and
// which secret signs a platform JWT.
func (s *Server) setupApplication() error {
	app, err := kaiten.New(kaiten.Options{
		DB:                    s.deps.DB,
		Config:                s.cfg.CoreConfig,
		UserProvider:          s.deps.UserProvider,
		UsageReporter:         s.deps.UsageReporter,
		ConnectorEntitlements: s.deps.ConnectorEntitlements,
		EntitlementConfig:     s.deps.EntitlementConfig,
		// A server with no database serves no background work: cmd/docs builds one
		// purely to walk the route table and generate the OpenAPI documents. This is
		// the same condition setupRetention applies to the transport-table sweep,
		// said once for every worker instead of re-derived per module.
		BackgroundWorkers: s.deps.DB != nil,
	})
	if err != nil {
		return fmt.Errorf("construct application: %w", err)
	}

	s.app = app
	return nil
}

// registerBuiltInConnectors records the manifests of the connectors compiled into
// this binary.
//
// The server passes the credential-free surface along and calls a method on the
// registrar, never on the surface --
// TestInProcessWiringPackagesNeverInvokeTheSurface holds it to that.
//
// Two callers, one mechanism: startup when there is a schema to register into,
// the readiness probe when there was not. Registration upserts on the connector
// name, so the overlap registers nothing twice.
func (s *Server) registerBuiltInConnectors(ctx context.Context) error {
	return builtinconnectors.New(s.app.InProcess(), builtInConnectorManifests...).RegisterAll(ctx)
}

// registerBuiltInConnectorsIfMigrated registers them before the listeners come up,
// when there is a schema to register into.
//
// A missing manifest is worse than a failed start (see
// builtinconnectors.RegisterAll), so a database that answers and refuses is fatal.
// An unmigrated one is not: this process may start before the migration Job
// finishes, and readyz's schema gate serves 503 rather than crashlooping, so
// registration is deferred to the readiness probe. Either way no replica serves
// traffic with a shipped connector unregistered.
//
// Skipped without a database: cmd/docs builds a server purely to walk the route
// table and must not execute a statement.
func (s *Server) registerBuiltInConnectorsIfMigrated(ctx context.Context) error {
	if s.deps.DB == nil {
		return nil
	}

	current, err := database.IsSchemaCurrent(ctx, s.deps.DB)
	switch {
	case err != nil:
		slog.WarnContext(
			ctx, "deferring built-in connector registration: could not determine the schema version",
			"error", err,
		)

		return nil
	case !current:
		slog.WarnContext(ctx, "deferring built-in connector registration: database schema is not up to date")

		return nil
	}

	return s.registerBuiltInConnectors(ctx)
}

// builtInConnectorManifests is the list of connectors this binary ships. Adding one
// is one line here plus the connector's own package -- there is no registration
// protocol for it to implement and no startup hook for it to own.
var builtInConnectorManifests = []builtinconnectors.Manifest{
	attio.Manifest(),
}

// setupRetention starts the background sweep that bounds outbox_events and
// inbox_events. It runs inside the API process rather than as a chart CronJob
// so the mechanism ships with the code that writes the rows;
// the advisory lock inside the sweep means running it on every replica costs
// one lock probe per interval on all but one of them.
//
// Outbox retention deletes are storage maintenance rather than domain events,
// so both the Helm and local Debezium configurations skip delete operations.
func (s *Server) setupRetention(ctx context.Context) {
	if s.deps.DB == nil || !s.cfg.Retention.Enabled {
		return
	}

	job := retention.New(s.deps.DB, retention.Config{
		InitialDelay:       s.cfg.Retention.InitialDelay,
		Interval:           s.cfg.Retention.Interval,
		BatchSize:          s.cfg.Retention.BatchSize,
		OutboxEventsWindow: s.cfg.Retention.OutboxEvents,
		InboxEventsWindow:  s.cfg.Retention.InboxEvents,
	})
	job.Start(ctx)
	// Registered on the application rather than on a registry of the server's own,
	// so one Close drains this sweep alongside the workers the modules started.
	// This sweep bounds the transport tables, which is why the server owns it and
	// no module does.
	s.app.OnStop(job.Stop)
}

// readinessProbe reports whether the API is ready to serve requests. Its
// primary purpose (beyond "is the process up", which livez already covers)
// is gating rollout on the database schema: a Job/Helm hook running
// kaiten-admin-tools migrate up is expected to complete before this process
// starts, but readiness still checks the schema version so kubelet keeps a
// pod out of the Service if that ordering is ever violated, and so a rolling
// upgrade's old-version pods aren't torn down until the new schema is live.
func (s *Server) readinessProbe(c fiber.Ctx) bool {
	if s.deps.DB == nil {
		return true
	}

	// Both conditions behind the latch only move forward, so once we've observed
	// them there is no need to keep hitting the database on every probe.
	if s.ready.Load() {
		return true
	}

	ctx, cancel := context.WithTimeout(c.Context(), readinessWorkTimeout)
	defer cancel()

	s.startupMu.Lock()
	defer s.startupMu.Unlock()
	if s.ready.Load() {
		return true
	}

	current, err := database.IsSchemaCurrent(ctx, s.deps.DB)
	if err != nil {
		slog.WarnContext(ctx, "readiness check failed: could not determine schema version", "error", err)
		return false
	}
	if !current {
		slog.WarnContext(ctx, "readiness check failed: database schema is not up to date")
		return false
	}

	// The registration startup deferred, if it deferred any. A replica must not join
	// the Service serving a connector's settings endpoints while the connector itself
	// is unregistered: updatesettings fails closed on that, so the deployment would
	// look configured and refuse every attempt to configure it.
	if err := s.registerBuiltInConnectors(ctx); err != nil {
		slog.ErrorContext(ctx, "readiness check failed: could not register built-in connectors", "error", err)
		return false
	}

	// Every accepted usage report writes the journal, and a month with no partition
	// fails every one of them: a replica does not serve until reports have
	// somewhere to land.
	if err := s.app.EnsureUsageLedger(ctx); err != nil {
		slog.ErrorContext(ctx, "readiness check failed: usage journal partitions", "error", err)
		return false
	}

	s.ready.Store(true)
	return true
}

// readinessWorkTimeout bounds the database work behind the readiness latch: the
// schema-version read, the built-in connector registration when startup deferred
// it, and the usage journal's partitions. Deliberately generous next to kubelet's
// own probe timeout -- a probe the kubelet gives up on still finishes its work in
// this process, and the next one reads the latch.
const readinessWorkTimeout = 5 * time.Second

// setupUsageReporter installs the reporter every module, resolver and
// dataloader bills through. It always installs one: with dogfooding disabled
// that is a services.NoopUsageReporter, so nothing downstream has to ask
// whether reporting is on before reporting.
func (s *Server) setupUsageReporter(ctx context.Context) error {
	if s.deps.UsageReporter != nil {
		s.deps.ConnectorEntitlements = services.ConnectorEntitlementsOrAlways(s.deps.ConnectorEntitlements)
		return nil
	}
	if !s.cfg.Metered.Enabled {
		s.deps.UsageReporter = services.NoopUsageReporter{}
		// Defaulted, not overwritten: a driver may supply a checker without supplying
		// a reporter, and clobbering it here would silently ungate every connector
		// for the caller that asked for the opposite.
		s.deps.ConnectorEntitlements = services.ConnectorEntitlementsOrAlways(s.deps.ConnectorEntitlements)
		return nil
	}
	// Derived from the external id rather than read as a raw UUID — see
	// Config.Metered.ResolvePlatformOrgID. The reporter uses it for one thing: not
	// metering the platform organization against itself.
	organizationID, err := s.cfg.Metered.ResolvePlatformOrgID()
	if err != nil {
		return fmt.Errorf("resolve dogfooding organization: %w", err)
	}
	var selfOrgID string
	if organizationID == uuid.Nil {
		slog.InfoContext(ctx, "no platform organization configured, dogfooding meters every organization it sees")
	} else {
		selfOrgID = organizationID.String()
	}
	reporter, err := dogfooding.NewReporter(ctx, dogfooding.Config{
		APIURL: s.cfg.Metered.APIURL,
		OrgID:  selfOrgID,
	}, s.cfg.Metered.TokenFile)
	if err != nil {
		return fmt.Errorf("initialize dogfooding reporter: %w", err)
	}
	s.deps.UsageReporter = reporter
	// The same client answers both questions, because both are questions for the
	// deployment that holds the licences -- but they stay two interfaces, so a use
	// case that reads an entitlement cannot accidentally meter one.
	//
	// Only when the driver supplied none, for the reason above.
	if s.deps.ConnectorEntitlements == nil {
		s.deps.ConnectorEntitlements = reporter
	}
	if s.deps.EntitlementConfig == nil {
		s.deps.EntitlementConfig = reporter
	}
	return nil
}

// setupAPI builds the huma.Config only. The huma.API itself is created once,
// in setupRoutes, on the /api group: building one here as well registered the
// six documentation routes (openapi.json, openapi.yaml, their 3.0 variants,
// docs, schemas) a second time on the raw router, so /docs and /api/docs both
// answered. Nothing needed the raw-router copy — huma.Config embeds
// *huma.OpenAPI, so the spec this function configures is the same pointer the
// /api API is built from.
func (s *Server) setupAPI() {
	kaitenhuma.SetErrorHandler()

	config := huma.DefaultConfig("Kaiten API", "1.0.0")
	config.Info.Description = "A RESTFul API for managing Kaiten features."
	config.Info.Contact = &huma.Contact{
		Name:  "Kaiten Team",
		Email: "support@kaiten.sh",
	}
	config.DocsRenderer = huma.DocsRendererScalar
	config.OpenAPIPath = "/openapi"
	// Empty, like the Platform document's: huma's renderer shows exactly one
	// spec, and there are two. kaitenhuma.RegisterDocs serves one page over
	// both at the same /api/docs path -- see setupRoutes.
	config.DocsPath = ""
	config.Servers = []*huma.Server{{URL: "/api"}}
	// $schema is removed: an MCP client's parser rejects the document with it.
	// See https://github.com/danielgtaylor/huma/issues/428#issuecomment-2085811497
	config.CreateHooks = []func(huma.Config) huma.Config{}

	config = kaitenhuma.ConfigureSecurity(config)
	config = kaitenhuma.ConfigureErrors(config)

	config.Webhooks = make(map[string]*huma.PathItem)

	s.apiConfig = config
	s.platformConfig = platformAPIConfig()
}

// platformAPIConfig builds the Platform API's OpenAPI document configuration.
func platformAPIConfig() huma.Config {
	config := huma.DefaultConfig("Kaiten Platform API", "1.0.0")
	config.Info.Description = "Platform-wide operations, authenticated by a Kaiten platform " +
		"token (`ksm_...`) that identifies `system:kaiten` and carries no organization " +
		"execution context. An operation that acts inside an organization names it in the " +
		"path; it never inherits one from the credential."
	config.Info.Contact = &huma.Contact{
		Name:  "Kaiten Team",
		Email: "support@kaiten.sh",
	}
	config.DocsRenderer = huma.DocsRendererScalar
	// Lands at /api/platform-openapi.{json,yaml} on the INTERNAL listener --
	// deliberately outside the /api/platform/ namespace, so publishing the document
	// does not require punching a hole in the authenticated prefix.
	config.OpenAPIPath = "/platform-openapi"
	config.SchemasPath = "/platform-schemas"
	// Huma's Scalar page renders exactly one document (api.go:545 skips the route
	// entirely when this is empty). kaitenhuma.RegisterDocs renders the page for
	// both surfaces, so neither config asks huma for one.
	config.DocsPath = ""
	// Operation paths carry the /platform prefix themselves.
	config.Servers = []*huma.Server{{URL: "/api"}}
	// Mirrors the Core document: no $schema, for MCP.
	config.CreateHooks = []func(huma.Config) huma.Config{}

	config = kaitenhuma.ConfigurePlatformSecurity(config)
	config = kaitenhuma.ConfigureErrors(config)

	return config
}

// setupRoutes builds both HTTP stacks and publishes the application onto them.
//
// Registration is ONE pass over the modules (httpapi.Register): module
// construction is not pure -- identity opens a pgnotify LISTEN and owns the token
// cache its handlers read through -- so a pass per surface would leave two
// listeners racing to invalidate two caches. The two stacks are two destinations,
// not two passes: deps.Core lands on the public app, deps.Platform on the
// internal one, and no path prefix decides anything.
func (s *Server) setupRoutes() {
	apiGroup, daprGroup := s.setupCoreRoutes()
	s.setupPlatformRoutes()

	httpapi.Register(httpapi.Deps{
		Core:      s.api,
		Platform:  s.platformAPI,
		Router:    apiGroup,
		DaprGroup: daprGroup,
		App:       s.app,
	})
	s.registerGraphQL(apiGroup)
}

// setupCoreRoutes builds the public stack: the /dapr group, the /api group with
// the Core authentication pipeline on it, the Core huma API and the reference
// page. It returns the two Fiber groups module registration still writes to
// directly -- the handful of routes that answer outside huma.
func (s *Server) setupCoreRoutes() (apiGroup, daprGroup fiber.Router) {
	// Dapr group is created first — before any auth middleware — so subscriber
	// routes are never inside the authentication pipeline.
	daprGroup = s.router.Group("/dapr")

	apiGroup = s.router.Group("/api")

	// The notification stream's credential arrives in a cookie, because
	// EventSource cannot send an Authorization header. The gateway validates it as
	// a JWT but forwards it where it found it, so this moves it to where every
	// credential-reading path in this process expects one.
	//
	// Scoped to that one path, and only when no header was sent: a browser
	// attaches a cookie to any request, so accepting one on a mutating endpoint
	// would be a CSRF surface. This is a GET of the caller's own feed.
	apiGroup.Use(func(c fiber.Ctx) error {
		if strings.TrimSuffix(c.Path(), "/") == notificationStreamPath &&
			len(c.Request().Header.Peek(fiber.HeaderAuthorization)) == 0 {
			if session := c.Cookies(sessionCookieName); session != "" {
				c.Request().Header.Set(fiber.HeaderAuthorization, "Bearer "+session)
			}
		}

		return c.Next()
	})

	if s.deps.Auth != nil {
		// The Core authenticator, whole. It accepts organization credentials and
		// has no code path to a platform principal at all -- no credential-kind
		// branch, no signing key, nothing that inspects a token to decide whether
		// to try platform verification. A platform credential presented here is an
		// organization JWT missing its organization claim, and is refused as one.
		authorize := s.deps.Auth.Authorization()
		apiGroup.Use(func(c fiber.Ctx) error {
			path := strings.TrimSuffix(c.Path(), "/")

			if IsPublicAPIPath(path) {
				return c.Next()
			}

			return authorize(c)
		})
	}
	// There is deliberately no credential-class middleware between auth and JIT.

	// The in-process surface rather than the pool: provisioning is two use cases now,
	// and this is the only injection point that hands the credential-free surface to a
	// transport package. It is legitimate here for the reason the surface exists --
	// this middleware runs while the request's own principal is still being resolved,
	// so there is no credential yet to authorize with.
	apiGroup.Use(jit.NewMiddleware(jit.NewProvisioner(s.app.InProcess())))

	// CORS is owned entirely by the reverse proxy in front of this service
	// (Envoy) — see docker/envoy/kaiten*.yaml.tmpl. An app-level policy
	// here would be a second, independently configured enforcement point
	// for the same decision.

	s.api = humafiber.NewWithGroup(s.router, apiGroup, s.apiConfig)
	kaitenhuma.RegisterDocs(apiGroup, []kaitenhuma.DocSource{
		{Title: "Core API", Config: s.apiConfig, Default: true},
	})

	return apiGroup, daprGroup
}

// platformAuthenticator is the middleware that authenticates the internal
// listener: the injected one if a test supplied it, otherwise the real one, built
// here from the application.
//
// Built rather than injected because authenticating a `ksm_` is a database read,
// not a signature check: it goes through the identity module's
// ValidatePlatformToken and that module's credential cache, which revocation
// evicts from and pgnotify invalidates across replicas. A caller assembling this
// middleware itself would give it a second cache, and a revoked credential would
// go on authenticating against it.
//
// nil only when there is no application to build it from: cmd/docs walks the
// route table and never listens.
func (s *Server) platformAuthenticator() auth.Middleware {
	if s.deps.PlatformAuth != nil {
		return s.deps.PlatformAuth
	}
	if s.app == nil {
		return nil
	}

	return auth.NewPlatform(s.app.Modules().Identity.ValidatePlatformToken)
}

// setupPlatformRoutes builds the internal stack.
//
// The Core stack minus everything a platform credential has no use for: no JIT (a
// platform credential has no organization to resolve, and resolving one would
// UPSERT it), no Dapr subscriber group, no GraphQL, no ext_authz route.
//
// What it has instead is the platform authenticator, which exists in this
// function and nowhere else in the process.
func (s *Server) setupPlatformRoutes() {
	// Same /api group as the Core listener, because the operation paths are
	// unchanged: an internal caller still addresses /api/platform/**, on a
	// different port. Nothing downstream had to move.
	platformGroup := s.platformRouter.Group("/api")

	if platformAuth := s.platformAuthenticator(); platformAuth != nil {
		authorize := platformAuth.Authorization()
		platformGroup.Use(func(c fiber.Ctx) error {
			path := strings.TrimSuffix(c.Path(), "/")

			if IsPublicPlatformAPIPath(path) {
				return c.Next()
			}

			return authorize(c)
		})
	}

	s.platformAPI = humafiber.NewWithGroup(s.platformRouter, platformGroup, s.platformConfig)
	// The Platform document's own reference page, at the same /api/docs path the
	// Core one uses on its listener. One document per page now: the two are on
	// different ports, and a page that linked to a spec served by the other listener
	// would be a link a reader cannot follow.
	kaitenhuma.RegisterDocs(platformGroup, []kaitenhuma.DocSource{
		{Title: "Platform API", Config: s.platformConfig, Default: true},
	})
}

// notificationStreamPath is the one path that may authenticate from a cookie,
// and sessionCookieName is the cookie it reads. The name matches what the
// identity provider sets (Clerk's is `__session`) because this does not mint a
// credential of its own -- it relocates the one the gateway already checked.
const (
	notificationStreamPath = "/api/v1/notifications/stream"
	sessionCookieName      = "__session"
)

// PlatformAPIPathPrefix is the Platform API's path namespace.
//
// It is descriptive and nothing else: no middleware branches on it, and none
// should. The two surfaces are separated by being served from different Fiber
// apps on different ports, which is a partition a path predicate cannot weaken by
// drifting. What is left for this constant is telling the boundary tests which
// namespace they are looking at while they walk the two route tables.
const PlatformAPIPathPrefix = "/api/platform"

// IsPlatformAPIPath reports whether path is inside the Platform API namespace.
//
// Exported for the boundary tests, which is its whole purpose -- see
// PlatformAPIPathPrefix.
func IsPlatformAPIPath(path string) bool {
	trimmed := strings.TrimSuffix(path, "/")
	return trimmed == PlatformAPIPathPrefix || strings.HasPrefix(trimmed, PlatformAPIPathPrefix+"/")
}

// IsPublicAPIPath reports whether path answers without a credential.
//
// Exported for the same reason IsPlatformAPIPath is: it is one of the two path
// predicates this server owns, and the boundary tests have to assert against the
// definition rather than against a restatement of it. A restatement is what
// silently disagrees -- the /api/openapi prefix covers huma's -3.0.json and
// -3.0.yaml downgrades too, which a list of exact paths does not.
func IsPublicAPIPath(path string) bool {
	if path == "/api/tokens/validate" || path == "/api/docs" {
		return true
	}

	if strings.HasPrefix(path, "/api/docs/") {
		return true
	}

	// Note there is deliberately no "/api/tokens/validate/" PREFIX arm here.
	// The exact match above is the whole allowlist for that endpoint: the
	// proxy rewrites every ext_authz check to that one constant path (see
	// validatetoken.RegisterEndpoint), so a prefix would widen the
	// auth-bypassing surface with nothing calling into it.

	// There is deliberately no /api/platform-openapi arm any more either. That
	// document moved to the Platform listener with the API it describes, so on this
	// listener the path is not a route to allowlist -- it is a 404, and one this
	// predicate must not describe as public.

	return strings.HasPrefix(path, "/api/openapi")
}

// IsPublicPlatformAPIPath is IsPublicAPIPath for the internal listener.
//
// It allowlists the Platform API's own documentation and nothing else: every
// /api/platform/** operation goes through the platform authenticator, and the
// listener being unroutable from outside is a second control rather than the
// only one.
//
// Exported for the same reason IsPublicAPIPath is: the boundary tests assert
// against the definition rather than a restatement of it.
func IsPublicPlatformAPIPath(path string) bool {
	if path == "/api/docs" || strings.HasPrefix(path, "/api/docs/") {
		return true
	}

	return strings.HasPrefix(path, "/api/platform-openapi")
}

func (s *Server) registerGraphQL(router fiber.Router) {
	gqlHandler := graphqlHandler.NewHandler(s.deps.DB, graphqlHandler.Config{
		EnablePlayground:    s.cfg.GraphQL.PlaygroundEnabled,
		EnableIntrospection: s.cfg.GraphQL.IntrospectionEnabled,
		UsageReporter:       s.deps.UsageReporter,
	})
	gqlHandler.RegisterRoutes(router)
}

// listenerDrainTimeout bounds the shutdown Start performs when one listener stops
// on its own. It is not the graceful-shutdown budget -- that one belongs to
// whoever calls Stop (30s in cmd/server) -- it is the wait for the *other* socket
// to close once the process has already decided it is going down.
const listenerDrainTimeout = 5 * time.Second

// Start serves both listeners and blocks until neither is serving.
//
// Two goroutines, one channel, and a rule: whichever listener stops first, the
// other comes down with it. A process serving its Core API on the public port
// while its Platform API is dead — or, worse, the reverse — is a half-open
// service that reports itself healthy; failing the whole process instead is what
// makes the two ports one deployment unit. The error goes back to the caller,
// which exits non-zero exactly as it did when there was one listener.
func (s *Server) Start() error {
	if s.router == nil || s.platformRouter == nil {
		return errors.New("application not initialized")
	}

	errs := make(chan error, 2)
	go func() { errs <- listen(s.platformRouter, s.cfg.Server.PlatformPort, "platform") }()
	go func() { errs <- listen(s.router, s.cfg.Server.Port, "core") }()

	// One listener has returned: it either failed to bind or Stop drained it.
	first := <-errs

	drainCtx, cancel := context.WithTimeout(context.Background(), listenerDrainTimeout)
	defer cancel()
	drained := s.stopListeners(drainCtx)

	// And now the other, so Start returns only once nothing is listening. Joined
	// rather than picked between: a bind failure on one port and a drain error on
	// the other are two different facts and an operator needs both.
	return errors.Join(first, <-errs, drained)
}

func listen(app *fiber.App, port uint, surface string) error {
	addr := ":" + strconv.FormatUint(uint64(port), 10)
	if err := app.Listen(addr); err != nil {
		return fmt.Errorf("%s listener on %s: %w", surface, addr, err)
	}
	return nil
}

func (s *Server) Stop(ctx context.Context) error {
	if s.router == nil {
		return nil
	}
	err := s.stopListeners(ctx)
	// After both routers have drained, so a worker is never stopped out from under a
	// request still using it, and before the usage reporter closes, because a
	// draining worker may still report.
	if s.app != nil {
		s.app.Close()
	}
	if reporter, ok := s.deps.UsageReporter.(interface{ Close() }); ok {
		reporter.Close()
	}
	return err
}

// stopListeners drains both HTTP servers and reports every failure. It is safe to
// call twice — Start calls it when a listener returns, and the signal handler
// calls Stop, which calls it again — because shutting down a server that has
// already stopped is a no-op.
func (s *Server) stopListeners(ctx context.Context) error {
	var errs []error
	for surface, app := range map[string]*fiber.App{"core": s.router, "platform": s.platformRouter} {
		if app == nil {
			continue
		}
		if err := app.ShutdownWithContext(ctx); err != nil {
			errs = append(errs, fmt.Errorf("shut down the %s listener: %w", surface, err))
		}
	}
	return errors.Join(errs...)
}

func (s *Server) Router() *fiber.App {
	return s.router
}

// PlatformRouter exposes the internal listener's Fiber app, for the boundary tests
// that assert what is registered on which of the two.
func (s *Server) PlatformRouter() *fiber.App {
	return s.platformRouter
}

func (s *Server) API() huma.API {
	return s.api
}

// PlatformAPI exposes the Platform API document, for the docs generator and for
// the contract tests that hold this surface to the same ratchets as the Core one.
func (s *Server) PlatformAPI() huma.API {
	return s.platformAPI
}
