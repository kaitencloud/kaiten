package auth

import (
	"context"
	"math"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"golang.org/x/time/rate"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
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
	ErrCodePublicInvalidCredential = "PublicAuth.InvalidCredential"
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
	limiterIdleAfter    = 10 * time.Minute
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

	keyLimits     *limiters
	sessionLimits *limiters
}

// NewPublic builds the public surface's authenticator.
func NewPublic(keys PublishableKeyAuthenticator, sessions CustomerSessionAuthenticator) *PublicMiddleware {
	return &PublicMiddleware{
		keys:          keys,
		sessions:      sessions,
		now:           time.Now,
		keyLimits:     newLimiters(publishableKeyRate, publishableKeyBurst),
		sessionLimits: newLimiters(sessionRate, sessionBurst),
	}
}

func (p *PublicMiddleware) Authorization() fiber.Handler {
	return func(ctx fiber.Ctx) error {
		path := strings.TrimSuffix(ctx.Path(), "/")
		if path == SessionPathPrefix || strings.HasPrefix(path, SessionPathPrefix+"/") {
			return p.session(ctx)
		}
		return p.publishable(ctx)
	}
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
	if err := p.keyLimits.take(ctx, keyID, p.now(), "too many requests for this publishable key"); err != nil {
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
	if err := p.sessionLimits.take(ctx, session.ID, p.now(), "too many requests for this session"); err != nil {
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

// limiters is one token bucket per credential. Buckets idle for
// limiterIdleAfter are dropped, at most once a minute, so the map holds the
// credentials in use rather than every one ever seen.
type limiters struct {
	rate  rate.Limit
	burst int

	mu      sync.Mutex
	buckets map[uuid.UUID]*bucket
	swept   time.Time
}

type bucket struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newLimiters(r rate.Limit, burst int) *limiters {
	return &limiters{rate: r, burst: burst, buckets: map[uuid.UUID]*bucket{}}
}

// take takes one token from id's bucket; when there is none, it answers 429
// with how long to wait.
func (l *limiters) take(ctx fiber.Ctx, id uuid.UUID, now time.Time, message string) error {
	if wait, allowed := l.allow(id, now); !allowed {
		ctx.Set(fiber.HeaderRetryAfter, strconv.Itoa(int(math.Ceil(wait.Seconds()))))
		return kaitenerrors.TooManyRequests(ErrCodePublicRateLimited, message)
	}
	return nil
}

func (l *limiters) allow(id uuid.UUID, now time.Time) (time.Duration, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if now.Sub(l.swept) > time.Minute {
		for key, b := range l.buckets {
			if now.Sub(b.lastSeen) > limiterIdleAfter {
				delete(l.buckets, key)
			}
		}
		l.swept = now
	}

	b, ok := l.buckets[id]
	if !ok {
		b = &bucket{limiter: rate.NewLimiter(l.rate, l.burst), lastSeen: now}
		l.buckets[id] = b
	}
	b.lastSeen = now

	reservation := b.limiter.ReserveN(now, 1)
	if delay := reservation.DelayFrom(now); delay > 0 {
		reservation.CancelAt(now)
		return delay, false
	}
	return 0, true
}

var _ Middleware = (*PublicMiddleware)(nil)
