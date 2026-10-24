package outbox

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

func decoded(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}

// The origin a payload names (§15.2 rule 6, §24 #76): a customer session's
// writes and an anonymous checkout's, except the checkout_session events;
// nothing for any other caller, and nothing on a payload that names one.
func TestStampOrigin(t *testing.T) {
	payload := []byte(`{"slug":"acme"}`)
	session, checkout := uuid.New(), uuid.New()
	kst := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
		Kind: principal.KindCustomerSession, UserID: uuid.New(), OrganizationID: uuid.New(),
		CustomerSession: &principal.CustomerSession{ID: session},
	})
	ksc := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
		Kind: principal.KindSystem, UserID: uuid.New(), OrganizationID: uuid.New(), CheckoutSessionID: checkout,
	})
	console := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
		Kind: principal.KindOrganization, UserID: uuid.New(), OrganizationID: uuid.New(),
	})

	require.Equal(t, map[string]any{"slug": "acme", "via": "customer_session", "customerSessionId": session.String()},
		decoded(t, stampOrigin(kst, "com.kaiten.instance.billing.v1.started", payload)))
	require.Equal(t, map[string]any{"slug": "acme", "via": "checkout_session", "checkoutSessionId": checkout.String()},
		decoded(t, stampOrigin(ksc, "com.kaiten.customer.v1.created", payload)))
	require.JSONEq(t, string(payload), string(stampOrigin(ksc, "com.kaiten.checkout_session.v1.completed", payload)))
	read := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
		Kind: principal.KindCheckoutSession, OrganizationID: uuid.New(), CheckoutSessionID: checkout,
	})
	require.Equal(t, "checkout_session", decoded(t, stampOrigin(read, "com.kaiten.instance.invoice.v1.paid", payload))["via"],
		"what a ksc_ read refreshes")
	require.JSONEq(t, string(payload), string(stampOrigin(console, "com.kaiten.customer.v1.created", payload)))
	require.JSONEq(t, string(payload), string(stampOrigin(context.Background(), "com.kaiten.customer.v1.created", payload)))
	require.Equal(t, `[1,2]`, string(stampOrigin(kst, "x", []byte(`[1,2]`))), "not an object")
}
