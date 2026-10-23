package outbox

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// The origins an event payload names when no person of the vendor's
// organization made the write (§15.2 rule 6).
const (
	// ViaCustomerSession is a write made through a kst_ customer session.
	ViaCustomerSession = "customer_session"
	// ViaCheckoutSession is a write made by an anonymous checkout's start or
	// completion, recorded under system:kaiten (V32-01, §24 #76).
	ViaCheckoutSession = "checkout_session"
)

// actorHeader is the header the request's actor is recorded under.
const actorHeader = "actor_id"

// checkoutEventPrefix names the checkout_session events, which describe the
// session itself and carry no marker.
const checkoutEventPrefix = "com.kaiten.checkout_session."

type (
	systemWorkKey struct{}
	actorKey      struct{}
)

// AsSystem records the events written with ctx under system:kaiten, whoever
// triggered the work: the close and sync passes, which a vendor may start
// from the console (§5 Conventions, "whoever triggers them").
func AsSystem(ctx context.Context) context.Context {
	return context.WithValue(ctx, systemWorkKey{}, true)
}

// systemUser is system:kaiten's id, read once per process: it never changes.
var systemUser struct {
	sync.Mutex
	id uuid.UUID
}

// withActor resolves the actor the events written with ctx are recorded
// under (§5 Conventions): the request's user -- the caller, the vendor
// principal behind a kst_ session, system:kaiten for an anonymous checkout's
// completion -- or system:kaiten when there is none, which is the case of
// every job, of a pk_ or ksc_ request, and of the work AsSystem marks.
func withActor(ctx context.Context, queries *db.Queries) (context.Context, error) {
	if forced, _ := ctx.Value(systemWorkKey{}).(bool); !forced {
		if p, ok := principal.FromContext(ctx); ok && p != nil && p.UserID != uuid.Nil {
			return context.WithValue(ctx, actorKey{}, p.UserID), nil
		}
	}
	systemUser.Lock()
	defer systemUser.Unlock()
	if systemUser.id == uuid.Nil {
		id, err := queries.GetSystemUserID(ctx)
		if errors.Is(err, pgx.ErrNoRows) {
			return ctx, nil // a database without the platform identity records none
		}
		if err != nil {
			return ctx, err
		}
		systemUser.id = id
	}
	return context.WithValue(ctx, actorKey{}, systemUser.id), nil
}

// actorOf is the actor withActor resolved, if any.
func actorOf(ctx context.Context) (uuid.UUID, bool) {
	actor, ok := ctx.Value(actorKey{}).(uuid.UUID)
	return actor, ok && actor != uuid.Nil
}

// stampOrigin adds via and the session id to an object payload written
// through a customer session or for an anonymous checkout -- its completion,
// or what its ksc_ read refreshes -- unless the payload already names them.
// Any other payload is returned as it is.
func stampOrigin(ctx context.Context, eventType string, data []byte) []byte {
	p, ok := principal.FromContext(ctx)
	if !ok || p == nil {
		return data
	}
	var via, key string
	var id uuid.UUID
	switch {
	case p.Kind == principal.KindCustomerSession && p.CustomerSession != nil:
		via, key, id = ViaCustomerSession, "customerSessionId", p.CustomerSession.ID
	case (p.Kind == principal.KindSystem || p.Kind == principal.KindCheckoutSession) && p.CheckoutSessionID != uuid.Nil:
		if strings.HasPrefix(eventType, checkoutEventPrefix) {
			return data
		}
		via, key, id = ViaCheckoutSession, "checkoutSessionId", p.CheckoutSessionID
	default:
		return data
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(data, &object); err != nil || object == nil {
		return data // not an object: nowhere to put the marker
	}
	if _, set := object["via"]; set {
		return data
	}
	object["via"], _ = json.Marshal(via)
	object[key], _ = json.Marshal(id)
	stamped, err := json.Marshal(object)
	if err != nil {
		return data
	}
	return stamped
}
