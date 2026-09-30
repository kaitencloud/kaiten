// Package jit provisions trusted identities after reverse-proxy authentication.
package jit

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensureorganization"
	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

const (
	provisionCacheTTL           = 5 * time.Minute
	provisionCacheSweepInterval = 10 * time.Minute
)

// provisioning is the credential-free surface an identity is resolved through:
// kaiten.InProcess satisfies it, and is what the server injects.
//
// Declared here rather than imported, which is the idiom the identity module's own
// ports already document: a package should depend on the behaviour it names, not on
// the container that happens to provide it. It is also what keeps the layering
// one-directional -- internal/kaiten reaches into the transport to wire it, and no
// transport package reaches back up to internal/kaiten.
//
// Neither method takes a caller, and that is the reason this surface is reachable
// from here at all. Provisioning runs midway through resolving the request's own
// principal: there is no credential yet to authorize it with, so there is no
// identity for a caller value to carry. What states that structurally is not a
// parameter but the namespace these two methods live on -- kaiten.InProcess, whose
// call sites tests/architecture allowlists, and this package is on the list.
type provisioning interface {
	EnsureOrganization(
		ctx context.Context, cmd *ensureorganization.Command,
	) (*organizationschema.Organization, error)

	EnsureUser(ctx context.Context, cmd *ensureuser.Command) (uuid.UUID, error)
}

// Provisioner resolves an authenticated principal's trusted external identity into
// internal UUIDs, through the two credential-free use cases that own those writes.
//
// It holds no pool and writes no SQL. What is left here is the part that is
// genuinely transport-shaped: the positive-resolution cache, which exists to keep
// an authenticated request off the database, and the claim validation that decides
// whether there is an identity to resolve at all.
type Provisioner struct {
	provisioning provisioning

	cache *provisionCache
}

func NewProvisioner(surface provisioning) *Provisioner {
	return &Provisioner{
		provisioning: surface,
		cache:        newProvisionCache(provisionCacheTTL, provisionCacheSweepInterval),
	}
}

// Check resolves identity and mutates identity.UserID and identity.OrganizationID
// with the resolved internal UUIDs on success. Only positive resolutions are cached
// — a 403 (deleted user or membership) or other error is never cached and is
// retried on the next request.
func (p *Provisioner) Check(ctx context.Context, identity *principal.Principal) error {
	if identity == nil {
		return fmt.Errorf("resolve jit identity: principal is nil")
	}
	if strings.TrimSpace(identity.Provisioning.Subject) == "" {
		return fmt.Errorf("resolve jit identity: subject is empty")
	}
	if strings.TrimSpace(identity.Provisioning.ExternalOrganizationID) == "" {
		return fmt.Errorf("resolve jit identity: external organization id is empty")
	}

	cacheKey := identity.Provisioning.Subject + ":" + identity.Provisioning.ExternalOrganizationID
	if entry, ok := p.cache.Get(cacheKey); ok {
		identity.UserID = entry.userID
		identity.OrganizationID = entry.organizationID
		return nil
	}

	// The claims go through untrimmed apart from the emptiness checks above. Both use
	// cases trim their own inputs, and deliberately: whitespace around a subject would
	// make two spellings of one identity, so normalizing it where the row is written
	// is what stops that from depending on which driver called.
	claims := identity.Provisioning

	organization, err := p.provisioning.EnsureOrganization(ctx, &ensureorganization.Command{
		ExternalID: claims.ExternalOrganizationID,
		Name:       claims.OrganizationName,
	})
	if err != nil {
		return err
	}

	// The organization's internal id, not the external claim again: it was just
	// resolved, and re-resolving it here would be a second lookup that could disagree
	// with the first.
	userID, err := p.provisioning.EnsureUser(ctx, &ensureuser.Command{
		Subject:        claims.Subject,
		Email:          claims.Email,
		Name:           claims.Name,
		OrganizationID: organization.ID,
	})
	if err != nil {
		return err
	}

	identity.UserID = userID
	identity.OrganizationID = organization.ID

	p.cache.Put(cacheKey, userID, organization.ID)
	slog.InfoContext(
		ctx, "jit identity resolved",
		"user_id", userID,
		"organization_id", organization.ID,
	)
	return nil
}

type provisionCacheEntry struct {
	userID         uuid.UUID
	organizationID uuid.UUID
	expiresAt      time.Time
}

type provisionCache struct {
	mu            sync.Mutex
	entries       map[string]provisionCacheEntry
	ttl           time.Duration
	sweepInterval time.Duration
	nextSweep     time.Time
	now           func() time.Time
}

func newProvisionCache(ttl, sweepInterval time.Duration) *provisionCache {
	return &provisionCache{
		entries:       make(map[string]provisionCacheEntry),
		ttl:           ttl,
		sweepInterval: sweepInterval,
		now:           time.Now,
	}
}

func (c *provisionCache) Get(key string) (provisionCacheEntry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	c.sweep(now)
	entry, ok := c.entries[key]
	if !ok || !now.Before(entry.expiresAt) {
		delete(c.entries, key)
		return provisionCacheEntry{}, false
	}
	return entry, true
}

func (c *provisionCache) Put(key string, userID, organizationID uuid.UUID) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	c.sweep(now)
	c.entries[key] = provisionCacheEntry{
		userID:         userID,
		organizationID: organizationID,
		expiresAt:      now.Add(c.ttl),
	}
}

func (c *provisionCache) sweep(now time.Time) {
	if now.Before(c.nextSweep) {
		return
	}
	for key, entry := range c.entries {
		if !now.Before(entry.expiresAt) {
			delete(c.entries, key)
		}
	}
	c.nextSweep = now.Add(c.sweepInterval)
}
