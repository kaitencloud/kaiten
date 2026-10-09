package auth

import (
	"context"
	"log/slog"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"golang.org/x/time/rate"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/ratelimit"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// PublishableKeyHeader carries a publishable key. Never Authorization: a pk_ is
// not a bearer credential, and keeping it out of that header keeps it out of
// every code path that treats one as such.
const PublishableKeyHeader = "X-Kaiten-Publishable-Key"

// SessionPathPrefix is the part of the public surface a customer session
// authenticates; the rest of /api/public takes a publishable key.
const SessionPathPrefix = "/api/public/session"

// Error codes of the public surface. One code for an unknown, malformed,
// revoked or expired credential, so a caller learns nothing about which it was.
const (
	ErrCodePublicInvalidCredential = "PublicAuth.InvalidCredential" //nolint:gosec // G101 false positive: an error code, not a credential
	ErrCodePublicOriginNotAllowed  = "PublicAuth.OriginNotAllowed"
	ErrCodePublicRateLimited       = "PublicAuth.RateLimited"
)

// Per-credential rates, per replica (§14.3): the gateway's limiter is per proxy
// and per route; these are per key and per session.
const (
	publishableKeyRate  = rate.Limit(20)
	publishableKeyBurst = 40
	sessionRate         = rate.Limit(10)
	sessionBurst        = 20
)

// PublishableKeyAuthenticator resolves a publishable key. It is implemented by
// the publicsdk module, which owns the table; it returns ok = false for every
// key that does not authenticate, whatever the reason.
type PublishableKeyAuthenticator interface {
	AuthenticatePublishableKey(ctx context.Context, plainKey string) (
		keyID, organizationID uuid.UUID, allowedOrigins []string, ok bool, err error,
	)
}

// CustomerSessionAuthenticator resolves a customer session: what it is bound
// to, its organization, and the vendor principal that minted it. Like
// PublishableKeyAuthenticator, ok = false for every session that does not
// authenticate.
type CustomerSessionAuthenticator interface {
	AuthenticateCustomerSession(ctx context.Context, plainToken string) (
		session principal.CustomerSession, organizationID, actorID uuid.UUID, ok bool, err error,
	)
}

// PublicMiddleware authenticates the public SDK surface, /api/public: a
// publishable key on the catalogue, a customer session on /api/public/session.
//
// It is a separate type rather than a branch of JWTMiddleware, as the platform
// one is: the public surface accepts its two credential classes and nothing
// else, and its route group installs only this. It verifies the credentials
// itself, by digest, instead of trusting a JWT the gateway minted -- the routes
// it guards face the internet with no ext_authz in front, so there is nothing
// upstream to trust, and an unsigned JWT would be forgeable by anyone who
// reached the listener.
//
// The two classes are disjoint (§14.1 rule 2): a publishable key on a session
// route, a session on the catalogue, and an organization credential anywhere
// here are all refused with the one wrong-credential answer.
type PublicMiddleware struct {
	keys     PublishableKeyAuthenticator
	sessions CustomerSessionAuthenticator
	now      func() time.Time

	keyLimits     *ratelimit.Keyed[uuid.UUID]
	sessionLimits *ratelimit.Keyed[uuid.UUID]
}

// NewPublic builds the public surface's authenticator.
func NewPublic(keys PublishableKeyAuthenticator, sessions CustomerSessionAuthenticator) *PublicMiddleware {
	return &PublicMiddleware{
		keys:          keys,
		sessions:      sessions,
		now:           time.Now,
		keyLimits:     ratelimit.New[uuid.UUID](publishableKeyRate, publishableKeyBurst),
		sessionLimits: ratelimit.New[uuid.UUID](sessionRate, sessionBurst),
	}
}

func (p *PublicMiddleware) Authorization() fiber.Handler {
	return func(ctx fiber.Ctx) error {
		path := strings.TrimSuffix(ctx.Path(), "/")
		if path == SessionPathPrefix || strings.HasPrefix(path, SessionPathPrefix+"/") {
			err := p.session(ctx)
			countPublicRequest(ctx, "kst", err)
			return err
		}
		err := p.publishable(ctx)
		countPublicRequest(ctx, "pk", err)
		return err
	}
}

// publicRequests is public_requests_total (§19.1), as
// kaiten.public.requests{credential, route, outcome}.
var publicRequests = sync.OnceValue(func() metric.Int64Counter {
	c, err := otel.GetMeterProvider().Meter("kaiten.public").Int64Counter("kaiten.public.requests",
		metric.WithDescription("Requests to the public SDK surface, by credential (pk, kst), route and outcome "+
			"(ok, refused, unauthenticated, rate_limited, error)"), metric.WithUnit("{request}"))
	if err != nil {
		slog.Warn("failed to register a public surface metric", "error", err)
		return nil
	}
	return c
})

// countPublicRequest records a request once it is answered. The route is the
// matched pattern, never the raw path, so slugs do not become labels.
func countPublicRequest(ctx fiber.Ctx, credential string, err error) {
	counter := publicRequests()
	if counter == nil {
		return
	}
	status := ctx.Response().StatusCode()
	if err != nil {
		status = kaitenerrors.GetHTTPStatus(err)
	}
	outcome := "ok"
	switch {
	case status == fiber.StatusTooManyRequests:
		outcome = "rate_limited"
	case status == fiber.StatusUnauthorized || status == fiber.StatusForbidden:
		outcome = "unauthenticated"
	case status >= 500:
		outcome = "error"
	case status >= 400:
		outcome = "refused"
	}
	route := "unmatched"
	if r := ctx.Route(); r != nil && r.Path != "" && r.Path != "/" {
		route = r.Path
	}
	counter.Add(ctx.Context(), 1, metric.WithAttributes(
		attribute.String("credential", credential), attribute.String("route", route), attribute.String("outcome", outcome)))
}

// publishable authenticates a catalogue request: a request carrying
// Authorization is the wrong credential class (a ksh_, a session or a JWT has
// no business here, and silently ignoring it would hide a misconfigured
// client); the key is resolved; a browser Origin must be one the key allows;
// the key's rate is enforced.
func (p *PublicMiddleware) publishable(ctx fiber.Ctx) error {
	if ctx.Get(fiber.HeaderAuthorization) != "" {
		return wrongCredentialClass()
	}

	plainKey := strings.TrimSpace(ctx.Get(PublishableKeyHeader))
	if !strings.HasPrefix(plainKey, token.PrefixPublishableKey) {
		return invalidPublicCredential()
	}

	keyID, organizationID, allowedOrigins, ok, err := p.keys.AuthenticatePublishableKey(ctx.Context(), plainKey)
	if err != nil {
		return kaitenerrors.Wrap(err, kaitenerrors.KindInternal, "PublicAuth.Failed", "internal server error")
	}
	if !ok {
		return invalidPublicCredential()
	}
	if err := checkOrigin(ctx, allowedOrigins, "this publishable key does not allow requests from this origin"); err != nil {
		return err
	}
	if err := take(p.keyLimits, keyID, p.now(), "too many requests for this publishable key"); err != nil {
		return err
	}

	ctx.SetContext(principal.ContextWithPrincipal(ctx.Context(), &principal.Principal{
		Token:            "",
		Kind:             principal.KindPublishableKey,
		UserID:           uuid.Nil,
		OrganizationID:   organizationID,
		PlatformTokenID:  uuid.Nil,
		CustomerSession:  nil,
		PublishableKeyID: keyID,
		Scopes:           nil,
		Provisioning:     principal.Provisioning{},
	}))
	return ctx.Next()
}

// session authenticates a session route: a publishable key is the wrong class
// there, and so is any bearer token that is not a kst_; the session is
// resolved, unexpired and unrevoked; a browser Origin must be one of its
// organization's publishable keys' origins; the session's rate is enforced.
func (p *PublicMiddleware) session(ctx fiber.Ctx) error {
	if ctx.Get(PublishableKeyHeader) != "" {
		return wrongCredentialClass()
	}
	header := ctx.Get(fiber.HeaderAuthorization)
	if header == "" {
		return invalidPublicCredential()
	}
	plainToken, ok := strings.CutPrefix(header, "Bearer ")
	if !ok {
		return invalidPublicCredential()
	}
	plainToken = strings.TrimSpace(plainToken)
	if !strings.HasPrefix(plainToken, token.PrefixCustomerSession) {
		// A ksh_, a ksm_ or a JWT: credentials of another surface.
		return wrongCredentialClass()
	}

	session, organizationID, actorID, ok, err := p.sessions.AuthenticateCustomerSession(ctx.Context(), plainToken)
	if err != nil {
		return kaitenerrors.Wrap(err, kaitenerrors.KindInternal, "PublicAuth.Failed", "internal server error")
	}
	if !ok {
		return invalidPublicCredential()
	}
	if err := checkOrigin(ctx, session.AllowedOrigins, "this session may not be used from this origin"); err != nil {
		return err
	}
	if err := take(p.sessionLimits, session.ID, p.now(), "too many requests for this session"); err != nil {
		return err
	}

	ctx.SetContext(principal.ContextWithPrincipal(ctx.Context(), &principal.Principal{
		Token:            "",
		Kind:             principal.KindCustomerSession,
		UserID:           actorID,
		OrganizationID:   organizationID,
		PlatformTokenID:  uuid.Nil,
		CustomerSession:  &session,
		PublishableKeyID: uuid.Nil,
		Scopes:           nil,
		Provisioning:     principal.Provisioning{},
	}))
	return ctx.Next()
}

// checkOrigin refuses a browser Origin outside allowed. A browser always sends
// Origin on a cross-origin request; server-side rendering sends none and is not
// a browser the allowlist could protect.
func checkOrigin(ctx fiber.Ctx, allowed []string, message string) error {
	if origin := ctx.Get(fiber.HeaderOrigin); origin != "" && !slices.Contains(allowed, strings.ToLower(origin)) {
		return kaitenerrors.Forbidden(ErrCodePublicOriginNotAllowed, message)
	}
	return nil
}

func wrongCredentialClass() error {
	return kaitenerrors.Forbidden(principal.ErrCodeWrongCredentialKind, principal.ErrMsgWrongCredentialKind)
}

func invalidPublicCredential() error {
	return kaitenerrors.Unauthorized(ErrCodePublicInvalidCredential, "invalid credential")
}

// take takes one token from id's bucket; when there is none, it answers 429
// with how long to wait.
func take(limits *ratelimit.Keyed[uuid.UUID], id uuid.UUID, now time.Time, message string) error {
	if wait, allowed := limits.Allow(id, now); !allowed {
		return kaitenerrors.TooManyRequests(ErrCodePublicRateLimited, message, wait)
	}
	return nil
}

var _ Middleware = (*PublicMiddleware)(nil)
