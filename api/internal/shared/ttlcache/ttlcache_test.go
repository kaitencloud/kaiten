package ttlcache

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestCache_SetAndGet(t *testing.T) {
	c := New[string](time.Minute, time.Minute)

	c.Set("key", "value")

	got, ok := c.Get("key")
	assert.True(t, ok)
	assert.Equal(t, "value", got)
}

func TestCache_GetMissingKey(t *testing.T) {
	c := New[string](time.Minute, time.Minute)

	got, ok := c.Get("missing")

	assert.False(t, ok)
	assert.Empty(t, got)
}

func TestCache_EntryExpiresAfterTTL(t *testing.T) {
	c := New[string](10*time.Millisecond, time.Hour) // long sweep: prove Get itself evicts, not the sweeper

	c.Set("key", "value")

	_, ok := c.Get("key")
	assert.True(t, ok, "entry should be readable before it expires")

	time.Sleep(30 * time.Millisecond)

	_, ok = c.Get("key")
	assert.False(t, ok, "entry should be gone once its TTL has elapsed")
}

func TestCache_Delete(t *testing.T) {
	c := New[string](time.Minute, time.Minute)
	c.Set("key", "value")

	c.Delete("key")

	_, ok := c.Get("key")
	assert.False(t, ok)
}

func TestCache_DeleteMissingKeyIsNoOp(t *testing.T) {
	c := New[string](time.Minute, time.Minute)

	assert.NotPanics(t, func() { c.Delete("missing") })
}

func TestCache_SetOverwritesExistingEntry(t *testing.T) {
	c := New[string](time.Minute, time.Minute)
	c.Set("key", "first")
	c.Set("key", "second")

	got, ok := c.Get("key")
	assert.True(t, ok)
	assert.Equal(t, "second", got)
}

func TestCache_SweepRemovesExpiredEntriesFromTheUnderlyingMap(t *testing.T) {
	c := New[string](10*time.Millisecond, 20*time.Millisecond)
	c.Set("key", "value")

	assert.Eventually(t, func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()
		_, stillPresent := c.entries["key"]
		return !stillPresent
	}, time.Second, 5*time.Millisecond, "the background sweep should evict the expired entry without a Get ever being called")
}

// Every writer targets the same key on purpose: contention on one entry is
// what exercises the lock, and it also gives the run a checkable end state --
// the last operation each goroutine performs is a Delete, so once they have
// all returned the key must be gone no matter which order they interleaved in.
// Run under -race for the data-race half of the guarantee.
func TestCache_ConcurrentSetGetDeleteLeavesTheKeyAbsent(t *testing.T) {
	t.Parallel()

	const writers = 20

	c := New[int](time.Minute, time.Minute)

	var wg sync.WaitGroup
	wg.Add(writers)
	for i := range writers {
		go func() {
			defer wg.Done()
			c.Set("key", i)
			c.Get("key")
			c.Delete("key")
		}()
	}
	wg.Wait()

	_, found := c.Get("key")
	assert.False(t, found, "every goroutine ends with Delete, so no writer may leave the key behind")
}
