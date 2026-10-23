package outbox

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"

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

// actorOf is the user the request's principal acts as, if any.
func actorOf(ctx context.Context) (uuid.UUID, bool) {
	p, ok := principal.FromContext(ctx)
	if !ok || p == nil || p.UserID == uuid.Nil {
		return uuid.Nil, false
	}
	return p.UserID, true
}

// stampOrigin adds via and the session id to an object payload written
// through a customer session or by an anonymous checkout, unless the payload
// already names them. Any other payload is returned as it is.
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
	case p.Kind == principal.KindSystem && p.CheckoutSessionID != uuid.Nil:
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
