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

// Error codes of the public surface. One code for an unknown, malformed or
// revoked key, so a caller learns nothing about which it was.
const (
	ErrCodePublicInvalidCredential = "PublicAuth.InvalidCredential"
	ErrCodePublicOriginNotAllowed  = "PublicAuth.OriginNotAllowed"
	ErrCodePublicRateLimited       = "PublicAuth.RateLimited"
)

// Per-key rate: 20 requests a second, bursts of 40, per replica (§14.3). The
// gateway's limiter is per proxy and per route; this one is per credential.
const (
	publishableKeyRate  = rate.Limit(20)
	publishableKeyBurst = 40
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

// PublishableKeyMiddleware authenticates the public SDK surface, /api/public.
//
// It is the third authenticator and, like the platform one, a separate type
// rather than a branch of JWTMiddleware: the public surface accepts one
// credential class and its route group installs only this. It verifies the key
// itself, by digest, instead of trusting a JWT the gateway minted -- the routes
// it guards face the internet with no ext_authz in front, so there is nothing
// upstream to trust, and an unsigned JWT would be forgeable by anyone who
// reached the listener.
//
// In order: a request carrying Authorization is refused as the wrong credential
// class (a ksh_ or a session JWT has no business here, and silently ignoring it
// would hide a misconfigured client); the key is resolved; a browser Origin
// must be one the key allows; the key's rate is enforced. Only then is the
// principal set.
type PublishableKeyMiddleware struct {
	authenticator PublishableKeyAuthenticator
	now           func() time.Time

	mu       sync.Mutex
	limiters map[uuid.UUID]*keyLimiter
	swept    time.Time
}

type keyLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// NewPublishableKey builds the public surface's authenticator.
func NewPublishableKey(authenticator PublishableKeyAuthenticator) *PublishableKeyMiddleware {
	return &PublishableKeyMiddleware{
		authenticator: authenticator,
		now:           time.Now,
		limiters:      map[uuid.UUID]*keyLimiter{},
	}
}

func (p *PublishableKeyMiddleware) Authorization() fiber.Handler {
	return func(ctx fiber.Ctx) error {
		if ctx.Get(fiber.HeaderAuthorization) != "" {
			return kaitenerrors.Forbidden(principal.ErrCodeWrongCredentialKind,
				principal.ErrMsgWrongCredentialKind)
		}

		plainKey := strings.TrimSpace(ctx.Get(PublishableKeyHeader))
		if !strings.HasPrefix(plainKey, token.PrefixPublishableKey) {
			return invalidPublishableKey()
		}

		keyID, organizationID, allowedOrigins, ok, err := p.authenticator.AuthenticatePublishableKey(ctx.Context(), plainKey)
		if err != nil {
			return kaitenerrors.Wrap(err, kaitenerrors.KindInternal, "PublicAuth.Failed", "internal server error")
		}
		if !ok {
			return invalidPublishableKey()
		}

		// A browser always sends Origin on a cross-origin request; server-side
		// rendering sends none and is not a browser the allowlist could protect.
		if origin := ctx.Get(fiber.HeaderOrigin); origin != "" &&
			!slices.Contains(allowedOrigins, strings.ToLower(origin)) {
			return kaitenerrors.Forbidden(ErrCodePublicOriginNotAllowed,
				"this publishable key does not allow requests from this origin")
		}

		if wait, allowed := p.allow(keyID); !allowed {
			ctx.Set(fiber.HeaderRetryAfter, strconv.Itoa(int(math.Ceil(wait.Seconds()))))
			return kaitenerrors.TooManyRequests(ErrCodePublicRateLimited,
				"too many requests for this publishable key")
		}

		ctx.SetContext(principal.ContextWithPrincipal(ctx.Context(), &principal.Principal{
			Token:            "",
			Kind:             principal.KindPublishableKey,
			UserID:           uuid.Nil,
			OrganizationID:   organizationID,
			PlatformTokenID:  uuid.Nil,
			PublishableKeyID: keyID,
			Scopes:           nil,
			Provisioning:     principal.Provisioning{},
		}))
		return ctx.Next()
	}
}

// allow takes one token from the key's bucket, and says how long to wait when
// there is none. Buckets idle for limiterIdleAfter are dropped, at most once a
// minute, so the map holds the keys in use rather than every key ever seen.
func (p *PublishableKeyMiddleware) allow(keyID uuid.UUID) (time.Duration, bool) {
	now := p.now()

	p.mu.Lock()
	defer p.mu.Unlock()

	if now.Sub(p.swept) > time.Minute {
		for id, l := range p.limiters {
			if now.Sub(l.lastSeen) > limiterIdleAfter {
				delete(p.limiters, id)
			}
		}
		p.swept = now
	}

	l, ok := p.limiters[keyID]
	if !ok {
		l = &keyLimiter{limiter: rate.NewLimiter(publishableKeyRate, publishableKeyBurst), lastSeen: now}
		p.limiters[keyID] = l
	}
	l.lastSeen = now

	reservation := l.limiter.ReserveN(now, 1)
	if delay := reservation.DelayFrom(now); delay > 0 {
		reservation.CancelAt(now)
		return delay, false
	}
	return 0, true
}

func invalidPublishableKey() error {
	return kaitenerrors.Unauthorized(ErrCodePublicInvalidCredential, "invalid publishable key")
}

var _ Middleware = (*PublishableKeyMiddleware)(nil)
