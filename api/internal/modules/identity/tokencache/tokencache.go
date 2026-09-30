// Package tokencache holds the type of the identity module's credential
// validation cache.
//
// It is its own package because one cache instance is shared by two use cases
// that must not depend on each other: validatetoken writes it,
// deletetokenonserviceaccount evicts from it, and identity_module.go wires the
// same instance into both plus the pgnotify listener that evicts across
// replicas.
package tokencache

import (
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/shared/ttlcache"
)

// TTL is how long a validated credential's JWT may be served from memory
// without a fresh SQL + bcrypt round trip. It bounds how long a *revoked*
// credential keeps working on a replica that missed the NOTIFY -- not how long
// an *expired* one does, which is Entry.ExpiresAt's job.
const TTL = 5 * time.Minute

// sweepInterval is how often expired entries are swept out of the map. Longer
// than TTL on purpose: Get already drops an expired entry it lands on, so the
// sweep only reclaims memory for keys nobody asks about again.
const sweepInterval = 10 * time.Minute

// Entry is one validated credential: what the credential resolved to, plus the
// credential's own expiry so a cache hit can be re-checked against it.
//
// The expiry has to live in the value because ttlcache has a single fixed TTL
// per instance and no per-entry TTL. Without it a credential expiring in ten
// seconds would keep authenticating for up to TTL after it died -- the cache
// TTL, which is about revocation staleness, would silently become the floor on
// every credential's lifetime.
//
// One type covers both credential families and never both halves at once, and
// nothing has to enforce that: the key is a hash of the whole plaintext, prefix
// included, so a ksh_ credential and a ksm_ one cannot reach the same entry even
// if they hashed alike after the prefix.
type Entry struct {
	// JWT is the internal JWT minted for an ORGANIZATION credential, which the
	// gateway forwards in the credential's place. Empty on the platform path,
	// which mints nothing: the Platform listener validates a ksm_ credential
	// itself and needs the facts below, not a token to hand back.
	JWT string
	// Platform is what a PLATFORM credential resolved to, nil on the organization
	// path. A pointer rather than two more flat fields so that "this entry is one
	// family or the other" is legible at the use site instead of inferred from a
	// zero value.
	Platform *PlatformEntry
	// ExpiresAt is nil for a credential that does not expire.
	ExpiresAt *time.Time
}

// PlatformEntry is a validated ksm_ credential, cached so the Platform API does
// not repeat a SQL lookup and a bcrypt compare on every request.
//
// It holds exactly what auth.PlatformMiddleware puts in the principal and no
// more. There is no identity to cache: a platform credential always authenticates
// system:kaiten, whose row id is a constant (platformidentity.ID).
type PlatformEntry struct {
	// TokenID is the credential's own row id -- the principal's PlatformTokenID,
	// which links a minted organization token back to its parent for cascade
	// revocation and audit attribution.
	TokenID uuid.UUID
	Scopes  []string
}

// Live reports whether this entry may still be served at now. Absolute-instant
// comparison, so it does not matter which location the expiry was decoded in.
func (e Entry) Live(now time.Time) bool {
	return e.ExpiresAt == nil || now.Before(*e.ExpiresAt)
}

// Cache is the shared cache type, keyed by a credential's lookup hash -- which
// is also what the eviction NOTIFY carries, so a revocation on any replica
// addresses the same key everywhere.
type Cache = ttlcache.Cache[Entry]

// New creates the identity module's credential cache.
func New() *Cache {
	return ttlcache.New[Entry](TTL, sweepInterval)
}
