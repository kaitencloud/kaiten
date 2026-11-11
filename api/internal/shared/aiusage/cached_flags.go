package aiusage

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"golang.org/x/sync/singleflight"
)

// maxStaleTTLs bounds how long a last known answer outlives its source: ten
// TTLs, five minutes at the default 30 s. Past it an unreachable source is
// closed again, exactly as it is for an organization never seen.
const maxStaleTTLs = 10

// CachedFlags asks its source at most once per organization, flag and TTL.
//
// Every report of every tenant resolves the rollout flag, so an uncached
// reader makes the flag source a per-request dependency of the usage path,
// with its own timeout. CachedFlags keeps both answers, true and false, for
// one TTL. A failure is kept for one TTL too, so an outage costs one source
// call per organization and TTL rather than one per request; during it the
// last successful answer is served for up to maxStaleTTLs TTLs.
//
// The price is latency on the flag itself: enabling, revoking and recovering
// from an outage each take up to one TTL per replica, and a revocation issued
// while the source is down is not seen before the source answers again or the
// stale bound passes. Only admission (reservations, catalogue, reads) depends
// on the answer; recorded usage does not.
type CachedFlags struct {
	source   FlagReader
	ttl      time.Duration
	maxStale time.Duration
	now      func() time.Time
	sourced  metric.Int64Counter

	flights  singleflight.Group
	mu       sync.Mutex
	entries  map[cachedFlag]cachedAnswer
	prunedAt time.Time
}

type cachedFlag struct {
	organizationID uuid.UUID
	key            string
}

type cachedAnswer struct {
	value     bool
	known     bool      // the source answered at least once
	valueAt   time.Time // when it last did
	checkedAt time.Time // when it was last asked
	err       error     // what the last ask returned
}

// NewCachedFlags wraps the operator-selected source. A nil source stays nil
// (closed), and a TTL of zero or less returns the source itself: every call
// then evaluates anew.
func NewCachedFlags(source FlagReader, ttl time.Duration) FlagReader {
	if source == nil || ttl <= 0 {
		return source
	}
	sourced, _ := otel.Meter("kaiten.ai_usage").Int64Counter("ai_rollout_flag_source_calls_total")
	return &CachedFlags{source: source, ttl: ttl, maxStale: maxStaleTTLs * ttl, now: time.Now, sourced: sourced, entries: map[cachedFlag]cachedAnswer{}, prunedAt: time.Now()}
}

func (c *CachedFlags) BooleanValue(ctx context.Context, organizationID uuid.UUID, key string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	flag := cachedFlag{organizationID: organizationID, key: key}
	c.mu.Lock()
	answer, seen := c.entries[flag]
	c.mu.Unlock()
	if seen && c.now().Sub(answer.checkedAt) < c.ttl {
		return c.read(answer)
	}
	// One source call per cold or expired flag, however many operations wait.
	// It outlives the caller that started it: the others still need its answer,
	// and the source bounds itself with its own evaluation timeout.
	flight := c.flights.DoChan(organizationID.String()+"\x00"+key, func() (any, error) {
		// A caller that missed above may arrive after the flight it would have
		// joined has finished: look again before asking the source a second time.
		c.mu.Lock()
		answer, seen := c.entries[flag]
		c.mu.Unlock()
		if seen && c.now().Sub(answer.checkedAt) < c.ttl {
			return answer, nil
		}
		return c.refresh(context.WithoutCancel(ctx), flag), nil
	})
	select {
	case <-ctx.Done():
		return false, ctx.Err()
	case result := <-flight:
		if result.Err != nil {
			return false, result.Err
		}
		return c.read(result.Val.(cachedAnswer))
	}
}

// ask turns a panicking source into a failed answer: singleflight would
// otherwise re-panic in a goroutine of its own and take the process down.
func (c *CachedFlags) ask(ctx context.Context, flag cachedFlag) (value bool, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			value, err = false, fmt.Errorf("platform flag source panicked: %v", recovered)
		}
	}()
	return c.source.BooleanValue(ctx, flag.organizationID, flag.key)
}

func (c *CachedFlags) refresh(ctx context.Context, flag cachedFlag) cachedAnswer {
	value, err := c.ask(ctx, flag)
	now := c.now()
	c.mu.Lock()
	answer := c.entries[flag]
	answer.checkedAt, answer.err = now, err
	if err == nil {
		answer.value, answer.known, answer.valueAt = value, true, now
	}
	c.entries[flag] = answer
	// Forget what nobody asked about for a whole stale bound, a deleted
	// organization for one. At most one pass over the map per bound.
	if now.Sub(c.prunedAt) >= c.maxStale {
		c.prunedAt = now
		for other, old := range c.entries {
			if now.Sub(old.checkedAt) >= c.maxStale {
				delete(c.entries, other)
			}
		}
	}
	c.mu.Unlock()
	if c.sourced != nil {
		outcome := "answered"
		if err != nil {
			outcome = "unavailable"
			if _, stale := c.read(answer); stale == nil {
				outcome = "stale"
			}
		}
		c.sourced.Add(ctx, 1, metric.WithAttributes(attribute.String("outcome", outcome)))
	}
	return answer
}

// read fails closed once the last successful answer is older than maxStale.
func (c *CachedFlags) read(answer cachedAnswer) (bool, error) {
	if answer.err == nil {
		return answer.value, nil
	}
	if answer.known && c.now().Sub(answer.valueAt) < c.maxStale {
		return answer.value, nil
	}
	return false, answer.err
}
