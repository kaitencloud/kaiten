// Package ttlcache provides a minimal, generic, thread-safe in-memory cache
// with a single fixed TTL per instance and periodic background eviction of
// expired entries. Written to replace the unmaintained (since 2017)
// github.com/patrickmn/go-cache for the one narrow use this codebase has for
// it (see internal/modules/identity) -- not a general-purpose caching
// library, so it only implements the handful of operations that use
// actually needs.
package ttlcache

import (
	"sync"
	"time"
)

type entry[V any] struct {
	value     V
	expiresAt time.Time
}

// Cache is a thread-safe map where every entry shares the same TTL, with a
// background goroutine that periodically sweeps expired entries out of the
// underlying map. That goroutine runs for the lifetime of the process --
// there is no Stop/Close, matching how the code that uses this cache today
// never explicitly shuts one down either.
type Cache[V any] struct {
	mu      sync.Mutex
	entries map[string]entry[V]
	ttl     time.Duration
}

// New creates a Cache whose entries expire ttl after being Set, sweeping
// expired entries out of the underlying map every sweepInterval.
func New[V any](ttl, sweepInterval time.Duration) *Cache[V] {
	c := &Cache[V]{
		entries: make(map[string]entry[V]),
		ttl:     ttl,
	}
	go c.sweep(sweepInterval)
	return c
}

// Get returns the cached value for key and true, or the zero value and
// false if key is absent or its entry has expired. An expired entry found
// during a Get is deleted immediately rather than waiting for the next
// sweep.
func (c *Cache[V]) Get(key string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	e, ok := c.entries[key]
	if !ok {
		var zero V
		return zero, false
	}
	if time.Now().After(e.expiresAt) {
		delete(c.entries, key)
		var zero V
		return zero, false
	}
	return e.value, true
}

// Set stores value under key with the cache's configured TTL, overwriting
// any existing entry for that key.
func (c *Cache[V]) Set(key string, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = entry[V]{value: value, expiresAt: time.Now().Add(c.ttl)}
}

// Delete removes key. A no-op if key isn't present.
func (c *Cache[V]) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, key)
}

func (c *Cache[V]) sweep(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		c.mu.Lock()
		now := time.Now()
		for key, e := range c.entries {
			if now.After(e.expiresAt) {
				delete(c.entries, key)
			}
		}
		c.mu.Unlock()
	}
}
