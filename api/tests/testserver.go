package tests

import (
	"context"
	"log/slog"
	"os"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/server"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/platform/auth"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// TestServer holds both of the server's Fiber apps, because there are two
// listeners and a test has to say which one it is calling.
//
// App is the Core (public) one and stays the default for every suite. PlatformApp
// is the internal one, and it is the ONLY app /api/platform/** answers on: a test
// that sends a platform request to App is asserting a 404, deliberately.
type TestServer struct {
	App          *fiber.App
	PlatformApp  *fiber.App
	Dependencies server.Dependencies

	server *server.Server
}

// Close stops the server the way the process does on shutdown: its listeners,
// then its background workers. Those include one pgnotify listener per module
// that listens, each on a Postgres connection of its own, and nothing else ever
// stops them -- a server a test forgets lives until the test binary exits. A
// suite that builds a server per subtest closes each one as the subtest ends, or
// their listeners pile up on the test database until it refuses new clients.
func (ts *TestServer) Close() error {
	return ts.server.Stop(context.Background())
}

// StubMiddleware is a no-op auth middleware for tests.
// If Scopes is nil/empty, scope.AllScopes() is used (the default for
// general-purpose tests). Tests that want to assert 403-for-missing-scope
// pass a restricted Scopes slice via TestServerOptions.
type StubMiddleware struct {
	UserID         uuid.UUID
	OrganizationID uuid.UUID
	Scopes         []string
}

func (s *StubMiddleware) Authorization() func(ctx fiber.Ctx) error {
	return func(c fiber.Ctx) error {
		scopes := s.Scopes
		if len(scopes) == 0 {
			scopes = scope.AllScopes()
		}
		i := principal.Principal{
			Kind:           principal.KindOrganization,
			UserID:         s.UserID,
			OrganizationID: s.OrganizationID,
			Scopes:         scopes,
		}

		// Attach the identity to the Fiber request context
		ctxWithIdentity := principal.ContextWithPrincipal(c.Context(), &i)
		c.SetContext(ctxWithIdentity)

		return c.Next()
	}
}

// StubPlatformMiddleware attaches a platform principal: the identity
// system:kaiten, no organization, and the id of the platform credential being
// presented.
//
// It is a separate type rather than a flag on StubMiddleware so that no test can
// accidentally produce the state the whole design forbids -- a platform
// principal that also carries an organization. There is no field here to set one
// with.
type StubPlatformMiddleware struct {
	PlatformTokenID uuid.UUID
	Scopes          []string
}

func (s *StubPlatformMiddleware) Authorization() func(ctx fiber.Ctx) error {
	return func(c fiber.Ctx) error {
		scopes := s.Scopes
		if len(scopes) == 0 {
			scopes = scope.AllScopes()
		}
		i := principal.Principal{
			Kind:            principal.KindPlatform,
			UserID:          platformidentity.ID,
			OrganizationID:  uuid.Nil,
			PlatformTokenID: s.PlatformTokenID,
			Scopes:          scopes,
		}

		c.SetContext(principal.ContextWithPrincipal(c.Context(), &i))

		return c.Next()
	}
}

type StubUserProvider struct {
	UserID         uuid.UUID
	OrganizationID uuid.UUID
}

func (s *StubUserProvider) GetUser(_ context.Context) (*currentuser.User, error) {
	return &currentuser.User{
		ID:             s.UserID,
		OrganizationID: s.OrganizationID,
	}, nil
}

// TestServerOptions allows customizing the test server configuration
type TestServerOptions struct {
	OrganizationID *uuid.UUID // Optional: override the default organization ID for stub auth
	UseJWTAuth     bool
	// Scopes, when non-empty, restricts the principal to the given scope
	// list (default is scope.AllScopes()). Use to test scope-gating
	// (e.g. 403 when the caller lacks write:metadata_fields).
	Scopes         []string
	ConfigOverride func(*config.Config)
	UsageReporter  services.UsageReporter

	// ConnectorEntitlements stands in for the licensing deployment. Nil means
	// services.AlwaysEntitled -- the self-hosted shape, where every registered
	// connector is available -- which is what every suite that does not care about
	// licences gets.
	ConnectorEntitlements services.ConnectorEntitlements

	// EntitlementConfig stands in for the licensing deployment's CONFIG
	// entitlements, such as an organization's usage history retention. Nil means
	// services.NoLicensingAuthority: the self-hosted shape, where those settings
	// come from the configuration.
	EntitlementConfig services.EntitlementConfig

	// BillingProviders stands in for the payment providers a deployment
	// registers. Nil means NOOP alone.
	BillingProviders provider.Registry

	// PlatformCredential makes BOTH of the server's listeners authenticate every
	// request as a platform credential (StubPlatformMiddleware) instead of an
	// organization one.
	//
	// Both, because the two things a suite does with this option are opposite
	// sides of one boundary: send platform requests to PlatformApp and have them
	// work, and send them to App and have them refused. The second needs a
	// platform principal to reach the Core pipeline, which no production
	// credential can now produce -- the stub is how the floor under that pipeline
	// stays testable.
	//
	// It also wires the REAL currentuser.ContextUserProvider rather than
	// StubUserProvider, and that is the point: StubUserProvider would hand every
	// Core handler an organization the credential does not have, quietly
	// reinstating exactly the confusion these tests exist to disprove.
	PlatformCredential bool
	// PlatformTokenID is the credential id the platform principal carries -- the
	// same value a signed platform JWT would supply. Set it to the id of a row
	// created by CreatePlatformToken when the test needs the credential to
	// resolve (GET /platform/me); leave it zero when the test only needs a
	// rejection.
	PlatformTokenID uuid.UUID
}

func NewTestServer(tdb *TestDatabase, opts ...TestServerOptions) *TestServer {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	// Use default organization ID from test database, unless overridden
	organizationID := tdb.DefaultData.OrganizationID
	if len(opts) > 0 && opts[0].OrganizationID != nil {
		organizationID = *opts[0].OrganizationID
	}

	// The config is built before the middleware because the real authenticator is
	// configured from it: a test that wants to present an actual platform JWT sets
	// PlatformJWTSigningKey through ConfigOverride, and the same value must reach
	// both auth (to verify) and the server (to mint).
	cfg := config.Config{Server: config.Server{Port: 0}}

	if len(opts) > 0 && opts[0].ConfigOverride != nil {
		opts[0].ConfigOverride(&cfg)
	}

	// One authenticator per listener, mirroring the runtime. Which stub goes on
	// which app is what a suite is really choosing when it sets these options:
	// PlatformCredential means "authenticate as the platform on BOTH apps", which
	// is what lets one server both exercise the Platform API and prove a platform
	// principal gets nowhere on a Core route. The default puts an organization
	// credential on both, so the Platform app refuses it exactly as it refuses one
	// in production.
	var authMiddleware, platformAuthMiddleware auth.Middleware
	var userProvider currentuser.Provider

	switch {
	case len(opts) > 0 && opts[0].UseJWTAuth:
		authMiddleware = auth.New()
		// platformAuthMiddleware stays nil on purpose: the server builds the real
		// platform authenticator from the application, because authenticating a
		// `ksm_` is a database read through the identity module's credential cache.
		// A suite asking for real authenticators gets that one.
		userProvider = &currentuser.ContextUserProvider{}
	case len(opts) > 0 && opts[0].PlatformCredential:
		platformStub := &StubPlatformMiddleware{
			PlatformTokenID: opts[0].PlatformTokenID,
			Scopes:          opts[0].Scopes,
		}
		authMiddleware = platformStub
		platformAuthMiddleware = platformStub
		userProvider = &currentuser.ContextUserProvider{}
	default:
		var scopes []string
		if len(opts) > 0 {
			scopes = opts[0].Scopes
		}
		organizationStub := &StubMiddleware{
			UserID:         tdb.DefaultData.UserID,
			OrganizationID: organizationID,
			Scopes:         scopes,
		}
		authMiddleware = organizationStub
		platformAuthMiddleware = organizationStub
		userProvider = &StubUserProvider{
			UserID:         tdb.DefaultData.UserID,
			OrganizationID: organizationID,
		}
	}

	dependencies := server.Dependencies{
		Auth:         authMiddleware,
		PlatformAuth: platformAuthMiddleware,
		UserProvider: userProvider,
		DB:           tdb.DbPool,
		Logger:       logger,
		UsageReporter: func() services.UsageReporter {
			if len(opts) > 0 {
				return opts[0].UsageReporter
			}
			return nil
		}(),
		ConnectorEntitlements: func() services.ConnectorEntitlements {
			if len(opts) > 0 {
				return opts[0].ConnectorEntitlements
			}
			return nil
		}(),
		EntitlementConfig: func() services.EntitlementConfig {
			if len(opts) > 0 {
				return opts[0].EntitlementConfig
			}
			return nil
		}(),
		BillingProviders: func() provider.Registry {
			if len(opts) > 0 {
				return opts[0].BillingProviders
			}
			return nil
		}(),
	}

	s, err := server.New(context.Background(), dependencies, cfg)
	if err != nil {
		panic("initialize test server: " + err.Error())
	}

	return &TestServer{
		App:          s.Router(),
		PlatformApp:  s.PlatformRouter(),
		Dependencies: dependencies,
		server:       s,
	}
}
