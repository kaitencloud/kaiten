package stripefake

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// route identifies an endpoint and the object id in its path.
func route(method, path string) (op, id string) {
	parts := strings.Split(strings.Trim(path, "/"), "/") // v1, resource, [id], [action]
	if len(parts) < 2 || parts[0] != "v1" {
		return "", ""
	}
	switch {
	case parts[1] == "customers" && len(parts) == 2 && method == http.MethodGet:
		return OpListCustomers, ""
	case parts[1] == "customers" && len(parts) == 2 && method == http.MethodPost:
		return OpCreateCustomer, ""
	case parts[1] == "customers" && len(parts) == 3 && method == http.MethodGet:
		return OpRetrieveCustomer, parts[2]
	case parts[1] == "customers" && len(parts) == 3 && method == http.MethodPost:
		return OpUpdateCustomer, parts[2]
	case parts[1] == "invoices" && len(parts) == 2 && method == http.MethodPost:
		return OpCreateInvoice, ""
	case parts[1] == "invoices" && len(parts) == 2 && method == http.MethodGet:
		return OpListInvoices, ""
	case parts[1] == "invoices" && len(parts) == 3 && method == http.MethodGet:
		return OpRetrieveInvoice, parts[2]
	case parts[1] == "invoices" && len(parts) == 3 && method == http.MethodPost:
		return OpUpdateInvoice, parts[2]
	case parts[1] == "invoices" && len(parts) == 3 && method == http.MethodDelete:
		return OpDeleteInvoice, parts[2]
	case parts[1] == "invoices" && len(parts) == 4 && parts[3] == "lines" && method == http.MethodGet:
		return OpListLines, parts[2]
	case parts[1] == "invoices" && len(parts) == 4 && parts[3] == "finalize" && method == http.MethodPost:
		return OpFinalizeInvoice, parts[2]
	case parts[1] == "invoices" && len(parts) == 4 && parts[3] == "void" && method == http.MethodPost:
		return OpVoidInvoice, parts[2]
	case parts[1] == "invoices" && len(parts) == 4 && parts[3] == "send" && method == http.MethodPost:
		return OpSendInvoice, parts[2]
	case parts[1] == "invoiceitems" && len(parts) == 2 && method == http.MethodPost:
		return OpCreateItem, ""
	case parts[1] == "invoiceitems" && len(parts) == 3 && method == http.MethodDelete:
		return OpDeleteItem, parts[2]
	case parts[1] == "coupons" && len(parts) == 2 && method == http.MethodPost:
		return OpCreateCoupon, ""
	case parts[1] == "coupons" && len(parts) == 3 && method == http.MethodGet:
		return OpRetrieveCoupon, parts[2]
	case parts[1] == "coupons" && len(parts) == 3 && method == http.MethodDelete:
		return OpDeleteCoupon, parts[2]
	case parts[1] == "events" && len(parts) == 2 && method == http.MethodGet:
		return OpListEvents, ""
	}
	return paymentRoute(method, parts)
}

// mutating are the operations whose results Stripe stores under a key.
func mutating(method string) bool { return method == http.MethodPost }

func (f *Fake) serve(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	form, _ := url.ParseQuery(string(body))
	if r.Method == http.MethodGet || r.Method == http.MethodDelete {
		form = r.URL.Query()
	}
	op, id := route(r.Method, r.URL.Path)
	key := r.Header.Get("Idempotency-Key")
	auth := r.Header.Get("Authorization")
	apiKey := strings.TrimPrefix(auth, "Bearer ")

	f.mu.Lock()
	f.calls = append(f.calls, Call{
		Op: op, Method: r.Method, Path: r.URL.Path, Form: form, IdempotencyKey: key,
		StripeVersion: r.Header.Get("Stripe-Version"), Authorization: auth,
	})
	down := f.down
	delay := f.delays[op]
	f.mu.Unlock()

	if down {
		hijackAndClose(w)
		return
	}
	if delay > 0 {
		select {
		case <-time.After(delay):
		case <-r.Context().Done():
			return
		}
	}

	f.mu.Lock()
	if rejection, ok := f.rejected[apiKey]; ok {
		f.mu.Unlock()
		status, _ := strconv.Atoi(rejection.DeclineCode)
		rejection.DeclineCode = ""
		f.write(w, status, errorBody(rejection), false)
		return
	}
	accountID := f.accounts[apiKey]
	if accountID == "" {
		accountID = DefaultAccount
	}
	if op == "" {
		f.mu.Unlock()
		f.write(w, http.StatusNotFound, errorBody(apiError{Type: "invalid_request_error", Code: "resource_missing", Message: "Unrecognized request URL"}), false)
		return
	}

	// Idempotency: replay, refuse a mismatch, or remember this attempt.
	var stored *storedKey
	slot := accountID + "\x00" + key
	if key != "" && mutating(r.Method) {
		fingerprint := r.URL.Path + "?" + canonical(form)
		if previous, ok := f.keys[slot]; ok && f.clock().Sub(previous.at) < keyHorizon {
			switch {
			case previous.inFlight:
				f.mu.Unlock()
				f.write(w, http.StatusConflict, errorBody(apiError{
					Type: "idempotency_error", Code: "idempotency_key_in_use",
					Message: "There is currently another in-progress request using this Idempotent Key",
				}), false)
				return
			case previous.params != fingerprint:
				f.mu.Unlock()
				f.write(w, http.StatusBadRequest, errorBody(apiError{
					Type:    "idempotency_error",
					Message: "Keys for idempotent requests can only be used with the same parameters they were first used with.",
				}), false)
				return
			default:
				status, replay := previous.status, previous.body
				f.mu.Unlock()
				f.write(w, status, replay, true)
				return
			}
		}
		stored = &storedKey{params: fingerprint, at: f.clock(), inFlight: true}
		f.keys[slot] = stored
	}

	// Injected failures answer before the endpoint executes, except 5xx,
	// which Stripe stores once it started executing.
	if faults := f.faults[op]; len(faults) > 0 {
		injected := faults[0]
		f.faults[op] = faults[1:]
		payload := errorBody(injected.err)
		if stored != nil {
			if injected.status >= 500 || (injected.status == http.StatusBadRequest && injected.err.Type != "idempotency_error") ||
				injected.status == http.StatusPaymentRequired {
				stored.status, stored.body, stored.inFlight = injected.status, payload, false
			} else {
				delete(f.keys, slot)
			}
		}
		f.mu.Unlock()
		f.write(w, injected.status, payload, false)
		return
	}

	status, payload := f.handle(accountID, apiKey, op, id, form)
	if stored != nil {
		if status == http.StatusBadRequest && strings.Contains(string(payload), "parameter_missing") {
			delete(f.keys, slot) // validation errors are not stored
		} else {
			stored.status, stored.body, stored.inFlight = status, payload, false
		}
	}
	drop := f.drops[op] > 0
	if drop {
		f.drops[op]--
	}
	f.mu.Unlock()

	if drop {
		hijackAndClose(w)
		return
	}
	f.write(w, status, payload, false)
}

func (f *Fake) write(w http.ResponseWriter, status int, body []byte, replayed bool) {
	f.mu.Lock()
	requestID := f.next("req")
	f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Request-Id", requestID)
	if replayed {
		w.Header().Set("Idempotent-Replayed", "true")
	}
	w.WriteHeader(status)
	_, _ = w.Write(body) //nolint:gosec // a test fake answering JSON its own handlers built, never HTML
}

func hijackAndClose(w http.ResponseWriter) {
	if hijacker, ok := w.(http.Hijacker); ok {
		if conn, _, err := hijacker.Hijack(); err == nil {
			_ = conn.Close()
			return
		}
	}
	w.WriteHeader(http.StatusServiceUnavailable)
}

func canonical(form url.Values) string {
	keys := make([]string, 0, len(form))
	for k := range form {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		vs := append([]string(nil), form[k]...)
		sort.Strings(vs)
		b.WriteString(k + "=" + strings.Join(vs, ",") + "&")
	}
	return b.String()
}

func errorBody(e apiError) []byte {
	out, _ := json.Marshal(map[string]any{"error": e})
	return out
}

func mustJSON(v any) []byte {
	out, _ := json.Marshal(v)
	return out
}

func missing(kind, id string) (int, []byte) {
	return http.StatusNotFound, errorBody(apiError{
		Type: "invalid_request_error", Code: "resource_missing", Param: "id",
		Message: "No such " + kind + ": '" + id + "'",
	})
}

func invalid(param, message string) (int, []byte) {
	return http.StatusBadRequest, errorBody(apiError{Type: "invalid_request_error", Code: "parameter_invalid", Param: param, Message: message})
}

// metadata collects metadata[...] members of a form.
func metadata(form url.Values) map[string]string {
	out := map[string]string{}
	for k, v := range form {
		if strings.HasPrefix(k, "metadata[") && strings.HasSuffix(k, "]") && len(v) > 0 {
			out[strings.TrimSuffix(strings.TrimPrefix(k, "metadata["), "]")] = v[0]
		}
	}
	return out
}

// values collects an array member (types[0], types[1] or types[]).
func values(form url.Values, name string) []string {
	var out []string
	for k, v := range form {
		if k == name || k == name+"[]" || (strings.HasPrefix(k, name+"[") && strings.HasSuffix(k, "]")) {
			out = append(out, v...)
		}
	}
	return out
}

func asInt(s string) int64 {
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}

// handle runs one endpoint, under f.mu.
func (f *Fake) handle(accountID, apiKey, op, id string, form url.Values) (int, []byte) {
	a := f.acct(accountID)
	live := strings.HasPrefix(apiKey, "rk_live_") || strings.HasPrefix(apiKey, "sk_live_")
	now := f.clock().Unix()
	switch op {
	case OpListCustomers:
		var data []any
		for _, c := range a.customers {
			if !c.Deleted {
				data = append(data, c)
			}
		}
		if len(data) > 1 {
			data = data[:1]
		}
		return http.StatusOK, list("/v1/customers", data, false)

	case OpCreateCustomer:
		c := &customer{
			ID: f.next("cus"), Object: "customer", Email: form.Get("email"), Name: form.Get("name"),
			Metadata: metadata(form), Livemode: live, Created: now,
		}
		a.customers[c.ID] = c
		return http.StatusOK, mustJSON(c)

	case OpRetrieveCustomer:
		c, ok := a.customers[id]
		if !ok {
			return missing("customer", id)
		}
		if c.Deleted {
			return http.StatusOK, mustJSON(map[string]any{"id": c.ID, "object": "customer", "deleted": true})
		}
		return http.StatusOK, mustJSON(f.renderCustomer(a, c))

	case OpUpdateCustomer:
		c, ok := a.customers[id]
		if !ok || c.Deleted {
			return missing("customer", id)
		}
		if email := form.Get("email"); email != "" {
			c.Email = email
		}
		if name := form.Get("name"); name != "" {
			c.Name = name
		}
		if status, body, refused := f.updateDefault(a, c.ID, form); refused {
			return status, body
		}
		return http.StatusOK, mustJSON(f.renderCustomer(a, c))

	case OpCreateInvoice:
		c, ok := a.customers[form.Get("customer")]
		if !ok || c.Deleted {
			return missing("customer", form.Get("customer"))
		}
		method := form.Get("collection_method")
		if method == "charge_automatically" && form.Get("days_until_due") != "" {
			return invalid("days_until_due", "You can only set days_until_due when collection_method is send_invoice.")
		}
		inv := &invoice{
			ID: f.next("in"), Object: "invoice", Customer: c.ID, Currency: form.Get("currency"),
			CollectionMethod: method, DaysUntilDue: asInt(form.Get("days_until_due")),
			AutoAdvance: form.Get("auto_advance") == "true", PendingInvoiceItemsBehavior: form.Get("pending_invoice_items_behavior"),
			AutomaticTax: map[string]any{"enabled": form.Get("automatic_tax[enabled]") == "true"},
			Metadata:     metadata(form), Status: "draft", StatusTransitions: map[string]int64{},
			Created: now, Livemode: live,
		}
		a.invoices[inv.ID] = inv
		a.order = append(a.order, inv.ID)
		return http.StatusOK, mustJSON(f.render(a, inv))

	case OpListInvoices:
		var data []any
		for i := len(a.order) - 1; i >= 0; i-- { // newest first
			inv := a.invoices[a.order[i]]
			if inv.deleted {
				continue
			}
			if c := form.Get("customer"); c != "" && inv.Customer != c {
				continue
			}
			if s := form.Get("status"); s != "" && inv.Status != s {
				continue
			}
			data = append(data, f.render(a, inv))
		}
		page, more := paginate(data, form)
		return http.StatusOK, list("/v1/invoices", page, more)

	case OpRetrieveInvoice:
		inv, ok := a.invoices[id]
		if !ok || inv.deleted {
			return missing("invoice", id)
		}
		return http.StatusOK, mustJSON(f.render(a, inv))

	case OpListLines:
		inv, ok := a.invoices[id]
		if !ok || inv.deleted {
			return missing("invoice", id)
		}
		page, more := paginate(f.linesExpanded(a, inv, contains(values(form, "expand"), "data.discounts")), form)
		return http.StatusOK, list("/v1/invoices/"+id+"/lines", page, more)

	case OpUpdateInvoice:
		inv, ok := a.invoices[id]
		if !ok || inv.deleted {
			return missing("invoice", id)
		}
		if d := form.Get("due_date"); d != "" {
			inv.DueDate = asInt(d)
		}
		return http.StatusOK, mustJSON(f.render(a, inv))

	case OpDeleteInvoice:
		inv, ok := a.invoices[id]
		if !ok || inv.deleted {
			return missing("invoice", id)
		}
		if inv.Status != "draft" {
			return invalid("id", "You can only delete draft invoices.")
		}
		inv.deleted = true
		f.emit(a, "invoice.deleted", inv)
		return http.StatusOK, mustJSON(map[string]any{"id": id, "object": "invoice", "deleted": true})

	case OpFinalizeInvoice:
		inv, ok := a.invoices[id]
		if !ok || inv.deleted {
			return missing("invoice", id)
		}
		if inv.Status != "draft" {
			return http.StatusBadRequest, errorBody(apiError{
				Type: "invalid_request_error", Code: "invoice_not_editable",
				Message: "This invoice is already finalized, you can't re-finalize a non-draft invoice.",
			})
		}
		if v := form.Get("auto_advance"); v != "" {
			inv.AutoAdvance = v == "true"
		}
		f.finalize(a, inv)
		return http.StatusOK, mustJSON(f.render(a, inv))

	case OpVoidInvoice:
		inv, ok := a.invoices[id]
		if !ok || inv.deleted {
			return missing("invoice", id)
		}
		if inv.Status != "open" {
			return http.StatusBadRequest, errorBody(apiError{
				Type: "invalid_request_error", Code: "invoice_not_editable",
				Message: "You can only void open invoices.",
			})
		}
		inv.Status = "void"
		inv.StatusTransitions["voided_at"] = now
		f.emit(a, "invoice.voided", inv)
		return http.StatusOK, mustJSON(f.render(a, inv))

	case OpSendInvoice:
		inv, ok := a.invoices[id]
		if !ok || inv.deleted {
			return missing("invoice", id)
		}
		inv.Sent++
		return http.StatusOK, mustJSON(f.render(a, inv))

	case OpCreateItem:
		inv, ok := a.invoices[form.Get("invoice")]
		if !ok || inv.deleted {
			return missing("invoice", form.Get("invoice"))
		}
		if inv.Status != "draft" {
			return invalid("invoice", "You can only add invoice items to draft invoices.")
		}
		if inv.AutomaticTax["enabled"] == true && asInt(form.Get("amount")) < 0 {
			return invalid("amount", "Negative invoice items cannot be added to invoices with automatic tax enabled.")
		}
		var discounts []itemDiscount
		for i := 0; form.Has("discounts[" + strconv.Itoa(i) + "][coupon]"); i++ {
			id := form.Get("discounts[" + strconv.Itoa(i) + "][coupon]")
			c, ok := a.coupons[id]
			if !ok || c.deleted {
				return missing("coupon", id)
			}
			if c.MaxRedemptions > 0 && f.redemptions(a, id) >= c.MaxRedemptions {
				return invalid("discounts", "Coupon "+id+" has been redeemed the maximum number of times.")
			}
			if c.Currency != form.Get("currency") {
				return invalid("discounts", "Coupon "+id+" is in another currency.")
			}
			discounts = append(discounts, itemDiscount{ID: f.next("di"), Coupon: id})
		}
		it := &item{
			ID: f.next("ii"), Object: "invoiceitem", Customer: form.Get("customer"), Invoice: inv.ID,
			Amount: asInt(form.Get("amount")), Currency: form.Get("currency"), Description: form.Get("description"),
			TaxBehavior: form.Get("tax_behavior"), Metadata: metadata(form),
			Period: map[string]int64{"start": asInt(form.Get("period[start]")), "end": asInt(form.Get("period[end]"))},
			lineID: f.next("il"), discounts: discounts,
		}
		for _, d := range discounts {
			it.Discounts = append(it.Discounts, d.ID)
		}
		a.items[it.ID] = it
		inv.itemIDs = append(inv.itemIDs, it.ID)
		f.retotal(a, inv)
		return http.StatusOK, mustJSON(it)

	case OpDeleteItem:
		it, ok := a.items[id]
		if !ok {
			return missing("invoiceitem", id)
		}
		inv := a.invoices[it.Invoice]
		if inv == nil || inv.Status != "draft" {
			return invalid("id", "You can only delete invoice items of draft invoices.")
		}
		delete(a.items, id)
		for i, itemID := range inv.itemIDs {
			if itemID == id {
				inv.itemIDs = append(inv.itemIDs[:i], inv.itemIDs[i+1:]...)
				break
			}
		}
		f.retotal(a, inv)
		return http.StatusOK, mustJSON(map[string]any{"id": id, "object": "invoiceitem", "deleted": true})

	case OpCreateCoupon:
		couponID := form.Get("id")
		if couponID == "" {
			couponID = f.next("co")
		}
		if existing, ok := a.coupons[couponID]; ok && !existing.deleted {
			return http.StatusBadRequest, errorBody(apiError{
				Type: "invalid_request_error", Code: "resource_already_exists", Param: "id", Message: "Coupon already exists.",
			})
		}
		if asInt(form.Get("amount_off")) <= 0 || form.Get("currency") == "" {
			return invalid("amount_off", "An amount_off coupon needs a positive amount_off and a currency.")
		}
		c := &coupon{
			ID: couponID, Object: "coupon", AmountOff: asInt(form.Get("amount_off")), Currency: form.Get("currency"),
			Duration: form.Get("duration"), MaxRedemptions: asInt(form.Get("max_redemptions")), Name: form.Get("name"),
			Metadata: metadata(form), Valid: true, Created: now,
		}
		a.coupons[c.ID] = c
		return http.StatusOK, mustJSON(c)

	case OpRetrieveCoupon:
		c, ok := a.coupons[id]
		if !ok || c.deleted {
			return missing("coupon", id)
		}
		return http.StatusOK, mustJSON(c)

	case OpDeleteCoupon:
		c, ok := a.coupons[id]
		if !ok || c.deleted {
			return missing("coupon", id)
		}
		c.deleted = true
		return http.StatusOK, mustJSON(map[string]any{"id": id, "object": "coupon", "deleted": true})

	case OpListEvents:
		types := values(form, "types")
		gte := asInt(form.Get("created[gte]"))
		var data []any
		for i := len(a.events) - 1; i >= 0; i-- { // newest first
			e := a.events[i]
			if e.Created < gte {
				continue
			}
			if len(types) > 0 && !contains(types, e.Type) {
				continue
			}
			data = append(data, e)
		}
		page, more := paginate(data, form)
		return http.StatusOK, list("/v1/events", page, more)
	}
	return f.handlePayment(a, op, id, form)
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// render is an invoice as Stripe answers it: with its first lines embedded,
// their discounts as ids.
func (f *Fake) render(a *account, inv *invoice) map[string]any {
	var out map[string]any
	_ = json.Unmarshal(mustJSON(inv), &out)
	totals := map[string]int64{}
	var order []string
	for _, itemID := range inv.itemIDs {
		for _, d := range f.discountAmounts(a, a.items[itemID]) {
			if _, seen := totals[d.discount.ID]; !seen {
				order = append(order, d.discount.ID)
			}
			totals[d.discount.ID] += d.amount
		}
	}
	totalDiscounts := []any{}
	for _, id := range order {
		totalDiscounts = append(totalDiscounts, map[string]any{"amount": totals[id], "discount": id})
	}
	out["total_discount_amounts"] = totalDiscounts
	lines := f.lines(a, inv)
	first := lines
	if len(first) > 10 {
		first = first[:10]
	}
	out["lines"] = map[string]any{"object": "list", "data": first, "has_more": len(lines) > 10, "url": "/v1/invoices/" + inv.ID + "/lines"}
	return out
}

func (f *Fake) lines(a *account, inv *invoice) []any { return f.linesExpanded(a, inv, false) }

// linesExpanded renders an invoice's lines: amount is gross, before
// discounts; discount_amounts name each discount by id; discounts are ids,
// or discount objects with their coupon when expanded.
func (f *Fake) linesExpanded(a *account, inv *invoice, expand bool) []any {
	var out []any
	for _, itemID := range inv.itemIDs {
		it := a.items[itemID]
		amounts := []any{}
		discounts := []any{}
		for _, d := range f.discountAmounts(a, it) {
			amounts = append(amounts, map[string]any{"amount": d.amount, "discount": d.discount.ID})
			if !expand {
				discounts = append(discounts, d.discount.ID)
				continue
			}
			source := map[string]any{"type": "coupon", "coupon": d.discount.Coupon}
			if c, ok := a.coupons[d.discount.Coupon]; ok {
				source["coupon"] = c
			}
			discounts = append(discounts, map[string]any{"id": d.discount.ID, "object": "discount", "source": source})
		}
		out = append(out, map[string]any{
			"id": it.lineID, "object": "line_item", "amount": it.Amount, "currency": it.Currency,
			"description": it.Description, "metadata": it.Metadata, "period": it.Period,
			"discount_amounts": amounts, "discounts": discounts,
			"parent": map[string]any{"type": "invoice_item_details", "invoice_item_details": map[string]any{"invoice_item": it.ID}},
		})
	}
	return out
}

func paginate(data []any, form url.Values) ([]any, bool) {
	if after := form.Get("starting_after"); after != "" {
		for i, d := range data {
			if idOf(d) == after {
				data = data[i+1:]
				break
			}
		}
	}
	limit := int(asInt(form.Get("limit")))
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	if len(data) > limit {
		return data[:limit], true
	}
	return data, false
}

func idOf(d any) string {
	switch v := d.(type) {
	case map[string]any:
		s, _ := v["id"].(string)
		return s
	case *customer:
		return v.ID
	case *event:
		return v.ID
	}
	var m map[string]any
	_ = json.NewDecoder(bytes.NewReader(mustJSON(d))).Decode(&m)
	s, _ := m["id"].(string)
	return s
}

func list(url string, data []any, more bool) []byte {
	if data == nil {
		data = []any{}
	}
	return mustJSON(map[string]any{"object": "list", "data": data, "has_more": more, "url": url})
}
