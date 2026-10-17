package stripefake

import (
	"net/http"
	"net/url"
	"time"
)

// Payment operations, as Fail, DropResponse, Delay and Count name them.
const (
	OpPayInvoice            = "PayInvoice"
	OpCreateCheckoutSession = "CreateCheckoutSession"
	OpRetrieveSession       = "RetrieveCheckoutSession"
	OpCreatePortalSession   = "CreatePortalSession"
	OpRetrievePaymentMethod = "RetrievePaymentMethod"
	OpDetachPaymentMethod   = "DetachPaymentMethod"
)

// Card outcomes of an off-session charge, as SetCardOutcome names them.
const (
	CardSucceeds              = ""
	CardDeclined              = "card_declined"
	CardInsufficientFunds     = "insufficient_funds"
	CardExpired               = "expired_card"
	CardAuthenticationRequire = "authentication_required"
)

type paymentMethod struct {
	ID       string         `json:"id"`
	Object   string         `json:"object"`
	Type     string         `json:"type"`
	Customer string         `json:"customer,omitempty"`
	Card     map[string]any `json:"card"`
	outcome  string
}

type checkoutSession struct {
	ID         string            `json:"id"`
	Object     string            `json:"object"`
	Mode       string            `json:"mode"`
	Customer   string            `json:"customer"`
	Currency   string            `json:"currency,omitempty"`
	Status     string            `json:"status"`
	URL        string            `json:"url"`
	ExpiresAt  int64             `json:"expires_at"`
	SuccessURL string            `json:"success_url"`
	CancelURL  string            `json:"cancel_url"`
	Metadata   map[string]string `json:"metadata"`
	form       url.Values
	intent     map[string]any
}

// payments is the payment state of one account.
type payments struct {
	methods  map[string]*paymentMethod
	defaults map[string]string // customer -> default payment method
	sessions map[string]*checkoutSession
}

func (a *account) pay() *payments {
	if a.payments == nil {
		a.payments = &payments{methods: map[string]*paymentMethod{}, defaults: map[string]string{}, sessions: map[string]*checkoutSession{}}
	}
	return a.payments
}

func paymentRoute(method string, parts []string) (op, id string) {
	switch {
	case parts[1] == "invoices" && len(parts) == 4 && parts[3] == "pay" && method == http.MethodPost:
		return OpPayInvoice, parts[2]
	case parts[1] == "checkout" && len(parts) == 3 && parts[2] == "sessions" && method == http.MethodPost:
		return OpCreateCheckoutSession, ""
	case parts[1] == "checkout" && len(parts) == 4 && parts[2] == "sessions" && method == http.MethodGet:
		return OpRetrieveSession, parts[3]
	case parts[1] == "billing_portal" && len(parts) == 3 && parts[2] == "sessions" && method == http.MethodPost:
		return OpCreatePortalSession, ""
	case parts[1] == "payment_methods" && len(parts) == 3 && method == http.MethodGet:
		return OpRetrievePaymentMethod, parts[2]
	case parts[1] == "payment_methods" && len(parts) == 4 && parts[3] == "detach" && method == http.MethodPost:
		return OpDetachPaymentMethod, parts[2]
	}
	return "", ""
}

// AttachCard saves a card on a customer, the customer's default unless one
// is set already, and returns its id. outcome is what an off-session charge
// of it does (CardSucceeds, CardDeclined, ...).
func (f *Fake) AttachCard(accountID, customerID, brand, last4 string, expMonth, expYear int, outcome string) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.attach(f.acct(accountID), customerID, brand, last4, expMonth, expYear, outcome, true)
}

func (f *Fake) attach(a *account, customerID, brand, last4 string, expMonth, expYear int, outcome string, makeDefault bool) string {
	p := a.pay()
	pm := &paymentMethod{
		ID: f.next("pm"), Object: "payment_method", Type: "card", Customer: customerID, outcome: outcome,
		Card: map[string]any{"brand": brand, "last4": last4, "exp_month": expMonth, "exp_year": expYear},
	}
	p.methods[pm.ID] = pm
	if makeDefault && p.defaults[customerID] == "" {
		p.defaults[customerID] = pm.ID
	}
	return pm.ID
}

// SetCardOutcome changes what charging a saved card does.
func (f *Fake) SetCardOutcome(accountID, paymentMethodID, outcome string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if pm, ok := f.acct(accountID).pay().methods[paymentMethodID]; ok {
		pm.outcome = outcome
	}
}

// DefaultPaymentMethod is the customer's default payment method in Stripe.
func (f *Fake) DefaultPaymentMethod(accountID, customerID string) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.acct(accountID).pay().defaults[customerID]
}

// CompleteSetupSession is the customer finishing a hosted setup page: a card
// is saved on the session's customer (not as its default: Stripe's setup mode
// does not set one) and checkout.session.completed is emitted. It returns the
// card's id.
func (f *Fake) CompleteSetupSession(accountID, sessionID, brand, last4 string, expMonth, expYear int) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	a := f.acct(accountID)
	session, ok := a.pay().sessions[sessionID]
	if !ok {
		return ""
	}
	pmID := f.attach(a, session.Customer, brand, last4, expMonth, expYear, CardSucceeds, false)
	session.Status = "complete"
	session.intent = map[string]any{
		"id": f.next("seti"), "object": "setup_intent", "status": "succeeded", "customer": session.Customer,
		"payment_method": a.pay().methods[pmID],
	}
	a.events = append(a.events, &event{
		ID: f.next("evt"), Object: "event", Type: "checkout.session.completed", Created: f.clock().Unix(),
		Data: map[string]any{"object": map[string]any{"id": session.ID, "object": "checkout.session", "mode": "setup", "customer": session.Customer}},
	})
	return pmID
}

func (f *Fake) customerEvent(a *account, eventType, customerID string) {
	a.events = append(a.events, &event{
		ID: f.next("evt"), Object: "event", Type: eventType, Created: f.clock().Unix(),
		Data: map[string]any{"object": map[string]any{"id": customerID, "object": "customer"}},
	})
}

// renderCustomer is a customer with its default payment method expanded.
func (f *Fake) renderCustomer(a *account, c *customer) map[string]any {
	out := map[string]any{}
	for k, v := range map[string]any{
		"id": c.ID, "object": "customer", "email": c.Email, "name": c.Name, "metadata": c.Metadata,
		"livemode": c.Livemode, "created": c.Created,
	} {
		out[k] = v
	}
	settings := map[string]any{"default_payment_method": nil}
	if pmID := a.pay().defaults[c.ID]; pmID != "" {
		settings["default_payment_method"] = a.pay().methods[pmID]
	}
	out["invoice_settings"] = settings
	return out
}

// handlePayment runs one payment endpoint, under f.mu.
func (f *Fake) handlePayment(a *account, op, id string, form url.Values) (int, []byte) {
	p := a.pay()
	now := f.clock()
	switch op {
	case OpPayInvoice:
		inv, ok := a.invoices[id]
		if !ok || inv.deleted {
			return missing("invoice", id)
		}
		if inv.Status != "open" {
			return http.StatusBadRequest, errorBody(apiError{
				Type: "invalid_request_error", Code: "invoice_not_open",
				Message: "Invoice is already " + inv.Status + ".",
			})
		}
		pmID := p.defaults[inv.Customer]
		if pmID == "" {
			return http.StatusBadRequest, errorBody(apiError{
				Type: "invalid_request_error", Code: "invoice_no_payment_method_types",
				Message: "The customer has no default payment method.",
			})
		}
		inv.AttemptCount++
		switch outcome := p.methods[pmID].outcome; outcome {
		case CardSucceeds:
			inv.Status = "paid"
			inv.StatusTransitions["paid_at"] = now.Unix()
			f.emit(a, "invoice.paid", inv)
			return http.StatusOK, mustJSON(f.render(a, inv))
		case CardAuthenticationRequire:
			f.emit(a, "invoice.payment_action_required", inv)
			return http.StatusPaymentRequired, errorBody(apiError{
				Type: "card_error", Code: "invoice_payment_intent_requires_action",
				Message: "This payment requires additional user action before it can be completed successfully.",
			})
		case CardExpired:
			f.emit(a, "invoice.payment_failed", inv)
			return http.StatusPaymentRequired, errorBody(apiError{Type: "card_error", Code: "expired_card", Message: "Your card has expired."})
		default:
			f.emit(a, "invoice.payment_failed", inv)
			return http.StatusPaymentRequired, errorBody(apiError{
				Type: "card_error", Code: "card_declined", DeclineCode: outcome,
				Message: "Your card was declined.",
			})
		}

	case OpCreateCheckoutSession:
		if form.Get("mode") != "setup" {
			return invalid("mode", "this fake only knows setup sessions")
		}
		c, ok := a.customers[form.Get("customer")]
		if !ok || c.Deleted {
			return missing("customer", form.Get("customer"))
		}
		session := &checkoutSession{
			ID: f.next("cs"), Object: "checkout.session", Mode: "setup", Customer: c.ID, Currency: form.Get("currency"),
			Status: "open", ExpiresAt: now.Add(24 * time.Hour).Unix(), SuccessURL: form.Get("success_url"),
			CancelURL: form.Get("cancel_url"), Metadata: metadata(form), form: form,
		}
		session.URL = "https://checkout.stripe.test/c/" + session.ID
		p.sessions[session.ID] = session
		return http.StatusOK, mustJSON(session)

	case OpRetrieveSession:
		session, ok := p.sessions[id]
		if !ok {
			return missing("checkout.session", id)
		}
		out := map[string]any{}
		for k, v := range map[string]any{
			"id": session.ID, "object": session.Object, "mode": session.Mode, "customer": session.Customer,
			"status": session.Status, "url": session.URL, "expires_at": session.ExpiresAt, "metadata": session.Metadata,
		} {
			out[k] = v
		}
		if session.intent != nil {
			out["setup_intent"] = session.intent
		}
		return http.StatusOK, mustJSON(out)

	case OpCreatePortalSession:
		c, ok := a.customers[form.Get("customer")]
		if !ok || c.Deleted {
			return missing("customer", form.Get("customer"))
		}
		id := f.next("bps")
		return http.StatusOK, mustJSON(map[string]any{
			"id": id, "object": "billing_portal.session", "customer": c.ID, "return_url": form.Get("return_url"),
			"url": "https://billing.stripe.test/p/" + id,
		})

	case OpRetrievePaymentMethod:
		pm, ok := p.methods[id]
		if !ok {
			return missing("payment_method", id)
		}
		return http.StatusOK, mustJSON(pm)

	case OpDetachPaymentMethod:
		pm, ok := p.methods[id]
		if !ok || pm.Customer == "" {
			return missing("payment_method", id)
		}
		customerID := pm.Customer
		pm.Customer = ""
		if p.defaults[customerID] == id {
			delete(p.defaults, customerID)
		}
		a.events = append(a.events, &event{
			ID: f.next("evt"), Object: "event", Type: "payment_method.detached", Created: now.Unix(),
			Data: map[string]any{
				"object":              map[string]any{"id": id, "object": "payment_method", "customer": nil},
				"previous_attributes": map[string]any{"customer": customerID},
			},
		})
		return http.StatusOK, mustJSON(pm)
	}
	return missing("resource", id)
}

// updateDefault applies invoice_settings[default_payment_method] on a
// customer update.
func (f *Fake) updateDefault(a *account, customerID string, form url.Values) (int, []byte, bool) {
	pmID := form.Get("invoice_settings[default_payment_method]")
	if pmID == "" {
		return 0, nil, false
	}
	pm, ok := a.pay().methods[pmID]
	if !ok || pm.Customer != customerID {
		status, body := invalid("invoice_settings[default_payment_method]", "No such PaymentMethod: '"+pmID+"' on this customer")
		return status, body, true
	}
	a.pay().defaults[customerID] = pmID
	f.customerEvent(a, "customer.updated", customerID)
	return 0, nil, false
}
