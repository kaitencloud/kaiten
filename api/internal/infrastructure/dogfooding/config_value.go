package dogfooding

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	sdk "github.com/kaitencloud/sdk-go"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
)

// configValueTTL is how long a CONFIG entitlement read is reused. A licence
// setting changes when somebody buys something, not between two reads, and the
// readers (daily maintenance, history reads) do not need it fresher.
const configValueTTL = 24 * time.Hour

// ConfigValue reads a CONFIG entitlement of orgID's licence in the Kaiten
// installation this one reports to. nil means the licence does not grant it.
func (r *client) ConfigValue(ctx context.Context, orgID uuid.UUID, entitlementSlug string) (json.RawMessage, error) {
	// The platform organization is licensed by nobody above it: it reads its
	// settings from its own configuration.
	if r.isSelf(orgID) {
		return nil, services.ErrNoLicensingAuthority
	}

	readCtx, cancel := context.WithTimeout(ctx, usageReportTimeout)
	defer cancel()

	usage, err := r.sdkClient.Instances.GetEntitlementUsageMetric(readCtx, orgID.String(), entitlementSlug)
	if err != nil {
		var apiErr *sdk.Error
		if errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("read %q entitlement: %w", entitlementSlug, err)
	}

	value, err := usage.Value.AsConfigEntitlementValue()
	if err != nil || value.Type != "object" {
		return nil, fmt.Errorf("entitlement %q is not a CONFIG entitlement", entitlementSlug)
	}
	return json.Marshal(value.Value)
}

// ConfigValue resolves the lazily-loaded client and asks it, through a cache:
// a value read in the last configValueTTL is answered from memory, and when the
// licensing deployment cannot be reached the last value read is answered
// instead of the error. Only an organization never read successfully gets the
// error -- its setting is unknown, and its callers act on that.
func (r *Reporter) ConfigValue(ctx context.Context, orgID uuid.UUID, entitlementSlug string) (json.RawMessage, error) {
	key := configKey{orgID: orgID, slug: entitlementSlug}
	if value, fresh := r.configs.get(key); fresh {
		return value, nil
	}

	client, err := r.awaitClient(ctx)
	if err != nil {
		return r.configs.lastKnown(key, err)
	}

	value, err := client.ConfigValue(ctx, orgID, entitlementSlug)
	if errors.Is(err, services.ErrNoLicensingAuthority) {
		return nil, err
	}
	if err != nil {
		return r.configs.lastKnown(key, err)
	}

	r.configs.put(key, value)
	return value, nil
}

type configKey struct {
	orgID uuid.UUID
	slug  string
}

type configEntry struct {
	value  json.RawMessage
	readAt time.Time
}

// configCache holds one entry per (organization, slug) for the life of the
// process. The key space is the organizations this replica serves times the
// CONFIG slugs in the catalogue, which stays small.
type configCache struct {
	mu      sync.Mutex
	entries map[configKey]configEntry
}

func (c *configCache) get(key configKey) (json.RawMessage, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[key]
	if !ok || time.Since(entry.readAt) >= configValueTTL {
		return nil, false
	}
	return entry.value, true
}

func (c *configCache) put(key configKey, value json.RawMessage) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.entries == nil {
		c.entries = make(map[configKey]configEntry)
	}
	c.entries[key] = configEntry{value: value, readAt: time.Now()}
}

// lastKnown answers the last value read for key, however old, or err when
// none was ever read.
func (c *configCache) lastKnown(key configKey, err error) (json.RawMessage, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if entry, ok := c.entries[key]; ok {
		return entry.value, nil
	}
	return nil, err
}
