package createcustomersession

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"
	"golang.org/x/time/rate"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/shared/ratelimit"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CreateCustomerSession"

// Minting is limited to 50 sessions a second per organization, per replica
// (§14.3): one per page view of a busy app is far below it, a loop is not.
const (
	mintRate  = rate.Limit(50)
	mintBurst = 100
)

// CustomerSessionDraft is a session to mint.
type CustomerSessionDraft struct {
	CustomerSlug string  `json:"customerSlug" doc:"The customer the session acts for" example:"acme"`
	InstanceSlug *string `json:"instanceSlug,omitempty" doc:"Binds the session to one of the customer's instances; checkout, cancel and the other subscription routes need it. Omitted: the session reads the whole customer." example:"acme-prod"`
	TTLSeconds   *int32  `json:"ttlSeconds,omitempty" doc:"How long the session lives, in seconds: 300 to 3600 (CreateCustomerSession.InvalidTtl otherwise). Default 30 minutes; mint a new one before it ends." example:"1800"`
}

// CreatedCustomerSession is a minted session, the one time its token is shown.
type CreatedCustomerSession struct {
	ID           uuid.UUID `json:"id" doc:"Revoke it with POST /customer-sessions/{id}/revoke"`
	Token        string    `json:"token" doc:"The kst_ token: hand it to the customer's browser, which sends it as Authorization: Bearer on /api/public/session routes. Shown once; only its digest is stored." example:"kst_3q2-7wEXAMPLEtokenBodyOfFortyThreeCharactersX"`
	ExpiresAt    time.Time `json:"expiresAt"`
	CustomerSlug string    `json:"customerSlug"`
	InstanceSlug *string   `json:"instanceSlug,omitempty"`
}

type UseCase struct {
	deps   sessions.Deps
	limits *ratelimit.Keyed[uuid.UUID]
}

func NewUseCase(deps sessions.Deps) *UseCase {
	return &UseCase{deps: deps, limits: ratelimit.New[uuid.UUID](mintRate, mintBurst)}
}

// Execute mints a session for a customer, optionally bound to one of its
// instances. The actor -- the caller -- is recorded on the session and is who
// the writes made through it are attributed to.
func (u *UseCase) Execute(ctx context.Context, draft CustomerSessionDraft) (*CreatedCustomerSession, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	if wait, ok := u.limits.Allow(user.OrganizationID, time.Now()); !ok {
		return nil, kaitenerrors.TooManyRequests(operation+".RateLimited",
			"too many sessions minted for this organization: try again in a second", wait)
	}
	ttl := int32(sessions.DefaultTTLSeconds)
	if draft.TTLSeconds != nil {
		ttl = *draft.TTLSeconds
		if ttl < sessions.MinTTLSeconds || ttl > sessions.MaxTTLSeconds {
			return nil, kaitenerrors.UnprocessableEntityf(operation+".InvalidTtl",
				"ttlSeconds is between %d and %d", sessions.MinTTLSeconds, sessions.MaxTTLSeconds)
		}
	}

	q := u.deps.Queries(ctx)
	customer, err := q.GetSessionCustomer(ctx, db.GetSessionCustomerParams{OrganizationID: user.OrganizationID, Slug: draft.CustomerSlug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, kaitenerrors.NotFoundf(operation+".CustomerNotFound", "customer %q not found", draft.CustomerSlug)
	}
	if err != nil {
		return nil, err
	}
	var instanceID *uuid.UUID
	if draft.InstanceSlug != nil {
		instance, err := q.GetSessionInstance(ctx, db.GetSessionInstanceParams{OrganizationID: user.OrganizationID, Slug: *draft.InstanceSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFoundf(operation+".InstanceNotFound", "instance %q not found", *draft.InstanceSlug)
		}
		if err != nil {
			return nil, err
		}
		if instance.CustomerID != customer.ID {
			return nil, kaitenerrors.UnprocessableEntity(operation+".InstanceNotOfCustomer", "the instance belongs to another customer")
		}
		instanceID = &instance.ID
	}

	plaintext, lookupHash, err := sessions.Mint()
	if err != nil {
		return nil, err
	}
	row, err := q.CreateCustomerSession(ctx, db.CreateCustomerSessionParams{
		OrganizationID: user.OrganizationID, CustomerID: customer.ID, InstanceID: instanceID,
		LookupHash: lookupHash, ActorID: user.ID, TtlSeconds: float64(ttl),
	})
	if err != nil {
		return nil, err
	}
	// Housekeeping, never the caller's failure.
	if _, err := q.PurgeExpiredCustomerSessions(ctx, user.OrganizationID); err != nil {
		slog.WarnContext(ctx, "publicsdk: could not purge expired customer sessions", "error", err)
	}
	if c := minted(); c != nil {
		c.Add(ctx, 1)
	}
	return &CreatedCustomerSession{
		ID: row.ID, Token: plaintext, ExpiresAt: row.ExpiresAt.Time.UTC(),
		CustomerSlug: customer.Slug, InstanceSlug: draft.InstanceSlug,
	}, nil
}

// minted is customer_sessions_minted_total (§19.1).
var minted = sync.OnceValue(func() metric.Int64Counter {
	c, err := otel.GetMeterProvider().Meter("kaiten.public").Int64Counter("kaiten.public.customer_sessions.minted",
		metric.WithDescription("Customer sessions minted"), metric.WithUnit("{session}"))
	if err != nil {
		slog.Warn("failed to register a public surface metric", "error", err)
		return nil
	}
	return c
})
