// Package ratelimit is an in-memory token bucket per key, per replica: the
// API's own rate limits (§14.3), which the gateway's limiter cannot express
// because it is per proxy and per route, not per credential.
//
// Per replica on purpose. A limit that must hold across replicas would need a
// shared store on the request path; these only have to make abuse slow, and N
// replicas make it N times less slow at worst.
package ratelimit

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// idleAfter is how long a bucket may go unused before it is dropped. Dropping
// one forgets nothing that matters: an unused bucket has refilled anyway,
// unless its refill takes longer than this, in which case Keyed keeps it.
const idleAfter = 10 * time.Minute

// Keyed is one token bucket per key. Buckets idle long enough to have refilled
// are dropped, at most once a minute, so the map holds the keys in use rather
// than every key ever seen.
type Keyed[K comparable] struct {
	rate  rate.Limit
	burst int
	// keep is how long an idle bucket is kept: long enough to refill.
	keep time.Duration

	mu      sync.Mutex
	buckets map[K]*bucket
	swept   time.Time
}

type bucket struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// New is a token bucket per key, refilled at r and holding at most burst.
func New[K comparable](r rate.Limit, burst int) *Keyed[K] {
	keep := idleAfter
	if r > 0 {
		if refill := time.Duration(float64(burst) / float64(r) * float64(time.Second)); refill > keep {
			keep = refill
		}
	}
	return &Keyed[K]{rate: r, burst: burst, keep: keep, buckets: map[K]*bucket{}}
}

// Every is a rate of n events per period: "10 attempts per 10 minutes" is
// Every(10, 10*time.Minute), with a burst of 10.
func Every(n int, period time.Duration) rate.Limit {
	return rate.Limit(float64(n) / period.Seconds())
}

// Reservation is a token taken from a key's bucket, or how long until one is
// there.
type Reservation struct {
	reservation *rate.Reservation
	at          time.Time
	delay       time.Duration
}

// OK reports whether the token was there.
func (r Reservation) OK() bool { return r.delay <= 0 }

// Delay is how long until a token is there; 0 when OK.
func (r Reservation) Delay() time.Duration { return max(r.delay, 0) }

// Cancel gives the token back, so a request refused by another limit does not
// spend this one.
func (r Reservation) Cancel() {
	if r.reservation != nil {
		r.reservation.CancelAt(r.at)
	}
}

// Reserve takes a token from key's bucket at now. A reservation that is not OK
// has taken nothing.
func (l *Keyed[K]) Reserve(key K, now time.Time) Reservation {
	l.mu.Lock()
	defer l.mu.Unlock()

	if now.Sub(l.swept) > time.Minute {
		for k, b := range l.buckets {
			if now.Sub(b.lastSeen) > l.keep {
				delete(l.buckets, k)
			}
		}
		l.swept = now
	}

	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{limiter: rate.NewLimiter(l.rate, l.burst), lastSeen: now}
		l.buckets[key] = b
	}
	b.lastSeen = now

	reservation := b.limiter.ReserveN(now, 1)
	if !reservation.OK() {
		// A burst of 0: never.
		return Reservation{reservation: nil, at: now, delay: rate.InfDuration}
	}
	if delay := reservation.DelayFrom(now); delay > 0 {
		reservation.CancelAt(now)
		return Reservation{reservation: nil, at: now, delay: delay}
	}
	return Reservation{reservation: reservation, at: now, delay: 0}
}

// Allow takes a token from key's bucket at now; when there is none, it reports
// how long until there is.
func (l *Keyed[K]) Allow(key K, now time.Time) (wait time.Duration, ok bool) {
	r := l.Reserve(key, now)
	return r.Delay(), r.OK()
}

// All takes a token from every reservation's bucket, or from none: when one is
// refused, the others are given back and the longest wait is reported.
func All(reservations ...Reservation) (wait time.Duration, ok bool) {
	ok = true
	for _, r := range reservations {
		if !r.OK() {
			ok = false
			wait = max(wait, r.Delay())
		}
	}
	if !ok {
		for _, r := range reservations {
			r.Cancel()
		}
	}
	return wait, ok
}
