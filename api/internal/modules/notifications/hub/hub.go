// Package hub holds the SSE connections this replica is serving and turns one
// LISTEN/NOTIFY message into the frames they should each receive.
//
// It is per-replica state by design. A notification is announced to every
// replica (see ../announce), and each one answers for its own connections, so
// nothing has to know where a given browser is connected -- which is what keeps
// this working on two pods with no shared cache.
package hub

import (
	"sync"

	"github.com/google/uuid"
)

// Frame is one server-sent event. Name is the SSE `event:` line the client
// listens for: connected, notification, or read.
type Frame struct {
	Name string
	Data any
}

const (
	FrameConnected    = "connected"
	FrameNotification = "notification"
	FrameRead         = "read"
)

// MaxPerUser bounds how many streams one person can hold on one replica. Tabs
// are cheap to open and each one costs a goroutine and a socket here; past this,
// the oldest is closed rather than refusing the newest, because the newest is
// the tab the person is actually looking at.
const MaxPerUser = 3

// Connection is one open stream.
type Connection struct {
	UserID         uuid.UUID
	OrganizationID uuid.UUID

	// Subscription is resolved once, at connect, and dropped when the user's
	// preferences change (see Hub.InvalidateSubscription). Re-resolving per
	// announcement would be a query per event per connection.
	subscription   []string
	subscriptionOK bool

	frames chan Frame
	closed chan struct{}
	once   sync.Once
	mu     sync.Mutex
}

// Frames is what the HTTP handler ranges over.
func (c *Connection) Frames() <-chan Frame { return c.frames }

// Closed fires when the hub drops this connection, so the handler can return.
func (c *Connection) Closed() <-chan struct{} { return c.closed }

// Send delivers a frame, or drops it if the client is not keeping up.
//
// Dropping is correct here and not a compromise: the contract says the stream is
// a hint and the client refetches the feed on reconnect, so a dropped frame costs
// a stale badge until the next event. Blocking instead would stall the hub's
// fan-out loop -- one slow reader freezing every other stream on the replica.
func (c *Connection) Send(frame Frame) bool {
	select {
	case c.frames <- frame:
		return true
	default:
		return false
	}
}

func (c *Connection) close() {
	c.once.Do(func() { close(c.closed) })
}

func (c *Connection) subscribedTo(eventName string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.subscriptionOK {
		// The subscription was invalidated and not yet re-resolved: pass the
		// event on rather than swallow it. A notification the user has muted
		// showing up once after they changed a setting is a smaller failure
		// than one they asked for never arriving.
		return true
	}

	for _, name := range c.subscription {
		if name == eventName {
			return true
		}
	}

	return false
}

// SetSubscription publishes a freshly resolved subscription to the connection.
func (c *Connection) SetSubscription(subscription []string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.subscription = subscription
	c.subscriptionOK = true
}

// Hub is the registry.
type Hub struct {
	mu          sync.RWMutex
	byOrg       map[uuid.UUID]map[*Connection]struct{}
	byUser      map[uuid.UUID][]*Connection
	connections int
	maxTotal    int
}

// New builds a hub bounded at maxTotal connections for the whole replica, which
// is what stops a reconnect storm from turning into unbounded memory.
func New(maxTotal int) *Hub {
	return &Hub{
		byOrg:    map[uuid.UUID]map[*Connection]struct{}{},
		byUser:   map[uuid.UUID][]*Connection{},
		maxTotal: maxTotal,
	}
}

// ErrAtCapacity is returned by Add when this replica is full. The handler turns
// it into a 503, which the client's own backoff already knows how to read.
type ErrAtCapacity struct{}

func (ErrAtCapacity) Error() string { return "notifications: replica is at stream capacity" }

// Add registers a connection, evicting this user's oldest if they are over
// MaxPerUser.
func (h *Hub) Add(userID, organizationID uuid.UUID, buffer int) (*Connection, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.maxTotal > 0 && h.connections >= h.maxTotal {
		return nil, ErrAtCapacity{}
	}

	connection := &Connection{
		UserID:         userID,
		OrganizationID: organizationID,
		frames:         make(chan Frame, buffer),
		closed:         make(chan struct{}),
	}

	for len(h.byUser[userID]) >= MaxPerUser {
		oldest := h.byUser[userID][0]
		h.removeLocked(oldest)
		oldest.close()
	}

	if h.byOrg[organizationID] == nil {
		h.byOrg[organizationID] = map[*Connection]struct{}{}
	}
	h.byOrg[organizationID][connection] = struct{}{}
	h.byUser[userID] = append(h.byUser[userID], connection)
	h.connections++

	return connection, nil
}

// Remove deregisters a connection. Safe to call twice, which matters because the
// handler always calls it on the way out even when the hub already evicted it.
func (h *Hub) Remove(connection *Connection) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.removeLocked(connection)
	connection.close()
}

func (h *Hub) removeLocked(connection *Connection) {
	organization, ok := h.byOrg[connection.OrganizationID]
	if !ok {
		return
	}
	if _, present := organization[connection]; !present {
		return
	}

	delete(organization, connection)
	if len(organization) == 0 {
		delete(h.byOrg, connection.OrganizationID)
	}

	remaining := h.byUser[connection.UserID][:0]
	for _, candidate := range h.byUser[connection.UserID] {
		if candidate != connection {
			remaining = append(remaining, candidate)
		}
	}
	if len(remaining) == 0 {
		delete(h.byUser, connection.UserID)
	} else {
		h.byUser[connection.UserID] = remaining
	}

	h.connections--
}

// Recipients is every connection in an organization that subscribes to this
// event. Returned as a slice so the caller can do its per-connection work --
// which is a database read and a render -- without holding the hub's lock.
func (h *Hub) Recipients(organizationID uuid.UUID, eventName string) []*Connection {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var recipients []*Connection
	for connection := range h.byOrg[organizationID] {
		if connection.subscribedTo(eventName) {
			recipients = append(recipients, connection)
		}
	}

	return recipients
}

// ConnectionsFor is every stream one user holds on this replica.
func ConnectionsFor(h *Hub, userID uuid.UUID) []*Connection {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return append([]*Connection(nil), h.byUser[userID]...)
}

// InvalidateSubscription marks this user's streams as needing a fresh
// subscription, after they changed their preferences.
func (h *Hub) InvalidateSubscription(userID uuid.UUID) {
	h.mu.RLock()
	connections := append([]*Connection(nil), h.byUser[userID]...)
	h.mu.RUnlock()

	for _, connection := range connections {
		connection.mu.Lock()
		connection.subscriptionOK = false
		connection.mu.Unlock()
	}
}

// Len is how many streams this replica holds, for the metric.
func (h *Hub) Len() int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return h.connections
}
