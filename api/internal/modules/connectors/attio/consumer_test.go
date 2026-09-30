package attio

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/attio/attioclient"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/pkg/debezium"
)

// TestMain silences the connector's own logging.
//
// It logs through slog.Default() on purpose -- a connector inside kaiten-api belongs
// in kaiten-api's log stream, not in one of its own -- and most of the paths below log
// a warning or an error by design, so leaving the default handler in place would bury
// every test's real output under expected noise.
func TestMain(m *testing.M) {
	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
	os.Exit(m.Run())
}

var (
	testUserID = uuid.MustParse("11111111-1111-1111-1111-111111111111")
	testOrgID  = uuid.MustParse("22222222-2222-2222-2222-222222222222")
	otherOrgID = uuid.MustParse("33333333-3333-3333-3333-333333333333")
)

// --- fakes --------------------------------------------------------------------

var errUnexpectedStoreCall = errors.New("attio: unexpected store call")

// fakeStore is a KaitenStore with per-method overrides, and a method without one
// fails loudly instead of answering plausibly.
//
// Every test here is about which reads and writes a path makes, so an unstubbed call
// is a finding rather than a default: a create path that reads a licence it was never
// asked to map, or an error path that writes a link it should have left alone, shows
// up as errUnexpectedStoreCall instead of passing quietly.
type fakeStore struct {
	customer        func(ctx context.Context, slug string) (Customer, error)
	license         func(ctx context.Context, slug string) (License, error)
	deploymentZone  func(ctx context.Context, slug string) (string, error)
	customerLink    func(ctx context.Context, slug string) (Link, error)
	setCustomerLink func(ctx context.Context, slug string, link Link) error
	instanceLink    func(ctx context.Context, slug string) (Link, error)
	setInstanceLink func(ctx context.Context, slug string, link Link) error
}

func (s *fakeStore) Customer(ctx context.Context, slug string) (Customer, error) {
	if s.customer == nil {
		return Customer{}, errUnexpectedStoreCall
	}
	return s.customer(ctx, slug)
}

func (s *fakeStore) License(ctx context.Context, slug string) (License, error) {
	if s.license == nil {
		return License{}, errUnexpectedStoreCall
	}
	return s.license(ctx, slug)
}

func (s *fakeStore) DeploymentZoneName(ctx context.Context, slug string) (string, error) {
	if s.deploymentZone == nil {
		return "", errUnexpectedStoreCall
	}
	return s.deploymentZone(ctx, slug)
}

func (s *fakeStore) CustomerLink(ctx context.Context, slug string) (Link, error) {
	if s.customerLink == nil {
		return Link{}, errUnexpectedStoreCall
	}
	return s.customerLink(ctx, slug)
}

func (s *fakeStore) SetCustomerLink(ctx context.Context, slug string, link Link) error {
	if s.setCustomerLink == nil {
		return errUnexpectedStoreCall
	}
	return s.setCustomerLink(ctx, slug, link)
}

func (s *fakeStore) InstanceLink(ctx context.Context, slug string) (Link, error) {
	if s.instanceLink == nil {
		return Link{}, errUnexpectedStoreCall
	}
	return s.instanceLink(ctx, slug)
}

func (s *fakeStore) SetInstanceLink(ctx context.Context, slug string, link Link) error {
	if s.setInstanceLink == nil {
		return errUnexpectedStoreCall
	}
	return s.setInstanceLink(ctx, slug, link)
}

// fakeSettings answers one organization and refuses every other, which is how the
// tests below assert that the connector reads the settings of the organization it was
// bound to and never anybody else's.
type fakeSettings struct {
	t            *testing.T
	organization uuid.UUID
	payload      map[string]any
	err          error
	expectNoCall bool
	calls        int
}

func (f *fakeSettings) Get(_ context.Context, organizationID uuid.UUID, connectorName string) (map[string]any, error) {
	f.t.Helper()
	f.calls++

	if f.expectNoCall {
		f.t.Errorf("settings must not be read: the event should have been skipped before this point")
	}
	if organizationID != f.organization {
		f.t.Errorf("settings read for organization %s, expected %s", organizationID, f.organization)
	}
	if connectorName != Name {
		f.t.Errorf("settings read for connector %q, expected %q", connectorName, Name)
	}

	return f.payload, f.err
}

type fakeActivations struct {
	t            *testing.T
	organization uuid.UUID
	activated    bool
	err          error
}

func (f *fakeActivations) Activated(_ context.Context, organizationID uuid.UUID, connectorName string) (bool, error) {
	f.t.Helper()

	if organizationID != f.organization {
		f.t.Errorf("activation read for organization %s, expected %s", organizationID, f.organization)
	}
	if connectorName != Name {
		f.t.Errorf("activation read for connector %q, expected %q", connectorName, Name)
	}

	return f.activated, f.err
}

// --- construction helpers -----------------------------------------------------

// settingsPayload is what the store holds for a configured organization: the keys the
// manifest declares, spelled the one way updatesettings' schema validation allows. Its
// URL is Attio's, the only one it may hold: a test points the consumer at its double
// through newTestConsumer, never through the settings.
func settingsPayload(mapping map[string]string) map[string]any {
	payload := map[string]any{
		"attioApiKey": "attio-key",
		"attioApiUrl": attioclient.BaseURL,
		"syncPolicy":  string(SyncPolicyCreateAndBind),
	}

	if mapping != nil {
		raw := make(map[string]any, len(mapping))
		for source, attribute := range mapping {
			raw[source] = attribute
		}
		payload["fieldsMapping"] = raw
	}

	return payload
}

type consumerOption func(*Deps, *fakeSettings, *fakeActivations)

func withSyncPolicy(policy SyncPolicy) consumerOption {
	return func(_ *Deps, settings *fakeSettings, _ *fakeActivations) {
		settings.payload["syncPolicy"] = string(policy)
	}
}

func withOrganization(organizationID uuid.UUID) consumerOption {
	return func(deps *Deps, settings *fakeSettings, activations *fakeActivations) {
		deps.UserProvider = &currentuser.StaticUserProvider{UserID: testUserID, OrganizationID: organizationID}
		settings.organization = organizationID
		activations.organization = organizationID
	}
}

// newTestConsumer builds a consumer that sends its Attio requests to attioURL, a test
// double, in place of attioclient.BaseURL.
func newTestConsumer(t *testing.T, store KaitenStore, attioURL string, payload map[string]any, opts ...consumerOption) *Consumer {
	t.Helper()

	settings := &fakeSettings{t: t, organization: testOrgID, payload: payload}
	activations := &fakeActivations{t: t, organization: testOrgID, activated: true}
	deps := Deps{
		UserProvider: &currentuser.StaticUserProvider{UserID: testUserID, OrganizationID: testOrgID},
		Settings:     settings,
		Activations:  activations,
		Store:        store,
	}

	for _, opt := range opts {
		opt(&deps, settings, activations)
	}

	consumer := New(deps)
	consumer.attioURL = attioURL

	return consumer
}

// --- attio doubles ------------------------------------------------------------

// attioServerExpectingNoCall fails the test on any request, for the paths that must
// decide not to sync before they reach Attio.
func attioServerExpectingNoCall(t *testing.T) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("unexpected attio request: %s %s", r.Method, r.URL.Path)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(server.Close)

	return server
}

func attioServerCreating(t *testing.T, recordID, webURL string, created *int) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST request, got %s %s", r.Method, r.URL.Path)
		}
		*created++
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{"id":{"record_id":"` + recordID + `"},"web_url":"` + webURL + `"}}`))
	}))
	t.Cleanup(server.Close)

	return server
}

// attioServerCapturingCreate records the values map of each create, keyed by path, so
// a test can assert on the mapped fields of the company and of the workspace
// separately -- the instance path creates both, and one map would overwrite the other.
func attioServerCapturingCreate(t *testing.T, recordID, webURL string, valuesByPath map[string]map[string]any) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Data struct {
				Values map[string]any `json:"values"`
			} `json:"data"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("decode attio create payload: %v", err)
		}
		valuesByPath[r.URL.Path] = payload.Data.Values

		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{"id":{"record_id":"` + recordID + `"},"web_url":"` + webURL + `"}}`))
	}))
	t.Cleanup(server.Close)

	return server
}

// attioServerAnswering answers one expected method and path with one status and body,
// and fails the test on anything else.
func attioServerAnswering(t *testing.T, method, path string, status int, body string) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != method || r.URL.Path != path {
			t.Errorf("unexpected attio request: %s %s, expected %s %s", r.Method, r.URL.Path, method, path)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)

	return server
}

func textValue(t *testing.T, values map[string]any, attribute string) string {
	t.Helper()

	raw, ok := values[attribute]
	if !ok {
		t.Fatalf("expected attribute %q in attio values: %#v", attribute, values)
	}

	entries, ok := raw.([]any)
	if !ok || len(entries) != 1 {
		t.Fatalf("expected a single value for %q, got %#v", attribute, raw)
	}

	entry, ok := entries[0].(map[string]any)
	if !ok {
		t.Fatalf("expected a value object for %q, got %#v", attribute, entries[0])
	}

	value, _ := entry["value"].(string)

	return value
}

// --- events -------------------------------------------------------------------

func customerCreatedEvent() debezium.Event {
	return debezium.Event{
		ID:             "evt_1",
		OrganizationID: testOrgID.String(),
		EventType:      eventCustomerCreated,
		Data:           `{"id":"cust_1","slug":"acme","name":"Acme Corp","domain":"acme.com"}`,
	}
}

func customerUpdatedEvent() debezium.Event {
	event := customerCreatedEvent()
	event.ID = "evt_2"
	event.EventType = eventCustomerUpdated

	return event
}

func instanceCreatedEvent() debezium.Event {
	return debezium.Event{
		ID:             "evt_3",
		OrganizationID: testOrgID.String(),
		EventType:      eventInstanceCreated,
		Data: `{"id":"inst_1","slug":"acme-prod","name":"Acme Production","customerId":"cust_1",` +
			`"customerSlug":"acme","licenseSlug":"enterprise","startLicenseDate":"2026-01-01T00:00:00Z",` +
			`"endLicenseDate":"2027-06-30T12:30:00Z","deploymentZoneId":"11111111-0000-0000-0000-000000000001",` +
			`"deploymentZoneSlug":"aws-eu-west-1","lifecycleStage":"ACTIVE"}`,
	}
}

func instanceUpdatedEvent() debezium.Event {
	event := instanceCreatedEvent()
	event.ID = "evt_4"
	event.EventType = eventInstanceUpdated

	return event
}

// enrichedFieldsMapping maps every field whose value the connector has to go and read,
// so a test using it exercises the licence and zone lookups.
func enrichedFieldsMapping() map[string]string {
	return map[string]string{
		"instance.licenseType":     "kaiten_license_type",
		"instance.licenseName":     "kaiten_license_name",
		"instance.licenseStartsAt": "kaiten_license_starts_at",
		"instance.licenseEndsAt":   "kaiten_license_ends_at",
		"instance.deploymentZone":  "kaiten_deployment_zone",
		"instance.lifecycleStage":  "kaiten_lifecycle_stage",
	}
}

// enrichedInstanceStore is an unlinked instance whose customer is already in Attio,
// with the licence and the zone resolvable.
func enrichedInstanceStore(t *testing.T) *fakeStore {
	t.Helper()

	return &fakeStore{
		instanceLink: func(_ context.Context, _ string) (Link, error) {
			return Link{}, ErrLinkNotFound
		},
		customerLink: func(_ context.Context, _ string) (Link, error) {
			return Link{ExternalID: "rec_company"}, nil
		},
		setInstanceLink: func(_ context.Context, _ string, _ Link) error { return nil },
		license: func(_ context.Context, slug string) (License, error) {
			if slug != "enterprise" {
				t.Errorf("unexpected licence slug: %q", slug)
			}
			return License{Name: "Enterprise License", Type: "PAID"}, nil
		},
		deploymentZone: func(_ context.Context, slug string) (string, error) {
			if slug != "aws-eu-west-1" {
				t.Errorf("unexpected deployment zone slug: %q", slug)
			}
			return "AWS eu-west-1", nil
		},
	}
}

// --- the filter ---------------------------------------------------------------

func TestWantsExactlyTheEventsThisConnectorMirrors(t *testing.T) {
	consumer := New(Deps{})

	wanted := []string{
		"com.kaiten.customer.v1.created",
		"com.kaiten.customer.v1.updated",
		"com.kaiten.instance.v1.created",
		"com.kaiten.instance.v1.updated",
	}
	for _, eventType := range wanted {
		if !consumer.Wants(debezium.Event{EventType: eventType}) {
			t.Errorf("expected the connector to want %q", eventType)
		}
	}

	// Deleted customers and instances are deliberately not here: Attio keeps the
	// record and the console keeps the link, so there is nothing to sync. Every
	// other module's events are somebody else's business.
	unwanted := []string{
		"com.kaiten.customer.v1.deleted",
		"com.kaiten.instance.v1.deleted",
		"com.kaiten.instance.v1.deployed",
		"com.kaiten.component.v1.created",
		"com.kaiten.release.v1.created",
		"",
	}
	for _, eventType := range unwanted {
		if consumer.Wants(debezium.Event{EventType: eventType}) {
			t.Errorf("expected the connector not to want %q", eventType)
		}
	}
}

func TestNameIsTheStablePersistedConsumerIdentity(t *testing.T) {
	// The inbox dedup key holds this string, so a rename replays history. Asserted
	// literally rather than against the const, which would assert nothing.
	if got := New(Deps{}).Name(); got != "connector:kaiten.integration.crm.attio" {
		t.Fatalf("consumer name changed to %q: the inbox key is persisted and a rename replays history", got)
	}
}

// --- activation, entitlement and settings -------------------------------------

func TestConsumeSkipsWhenTheOrganizationHasNotActivatedTheConnector(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	settings := &fakeSettings{t: t, organization: testOrgID, expectNoCall: true, payload: settingsPayload(nil)}
	consumer := New(Deps{
		UserProvider: &currentuser.StaticUserProvider{UserID: testUserID, OrganizationID: testOrgID},
		Settings:     settings,
		Activations:  &fakeActivations{t: t, organization: testOrgID, activated: false},
		Store:        &fakeStore{},
	})
	consumer.attioURL = server.URL

	if err := consumer.Consume(context.Background(), customerCreatedEvent()); err != nil {
		t.Fatalf("a deactivated connector must consume the event without syncing, got: %v", err)
	}
	if settings.calls != 0 {
		t.Fatalf("expected the settings not to be read at all, got %d reads", settings.calls)
	}
}

func TestConsumeRetriesWhenActivationCannotBeRead(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	readErr := errors.New("database unavailable")
	consumer := New(Deps{
		UserProvider: &currentuser.StaticUserProvider{UserID: testUserID, OrganizationID: testOrgID},
		Settings:     &fakeSettings{t: t, organization: testOrgID, expectNoCall: true, payload: settingsPayload(nil)},
		Activations:  &fakeActivations{t: t, organization: testOrgID, err: readErr},
		Store:        &fakeStore{},
	})
	consumer.attioURL = server.URL

	err := consumer.Consume(context.Background(), customerCreatedEvent())
	if !errors.Is(err, readErr) {
		t.Fatalf("expected the activation read failure to ask for a redelivery, got: %v", err)
	}
}

func TestConsumeRetriesWhenTheSettingsStoreCannotBeRead(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	storeErr := errors.New("vault unreachable")
	settings := &fakeSettings{t: t, organization: testOrgID, payload: settingsPayload(nil), err: storeErr}
	consumer := New(Deps{
		UserProvider: &currentuser.StaticUserProvider{UserID: testUserID, OrganizationID: testOrgID},
		Settings:     settings,
		Activations:  &fakeActivations{t: t, organization: testOrgID, activated: true},
		Store:        &fakeStore{},
	})
	consumer.attioURL = server.URL

	// A store that cannot be read is the one settings failure a redelivery fixes, and
	// it is told apart from settings that are simply absent (below).
	err := consumer.Consume(context.Background(), customerCreatedEvent())
	if !errors.Is(err, storeErr) {
		t.Fatalf("expected an unreadable settings store to ask for a redelivery, got: %v", err)
	}
}

func TestConsumeSkipsWhenTheConnectorIsActivatedButNotConfigured(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	payload := settingsPayload(nil)
	delete(payload, "attioApiKey")

	consumer := newTestConsumer(t, &fakeStore{}, server.URL, payload)

	// Terminal, not transient: no redelivery invents an API key, and asking for one
	// would turn a single misconfigured organization into an endless loop for every
	// event it produces.
	if err := consumer.Consume(context.Background(), customerCreatedEvent()); err != nil {
		t.Fatalf("missing settings must be consumed rather than retried, got: %v", err)
	}
}

func TestConsumeSkipsSettingsThatNameAnotherAPIURL(t *testing.T) {
	// Settings stored before the schema pinned the URL. Neither the host they name nor
	// Attio hears about the event: it is consumed as not configured, so no request
	// ever reaches a host an organization chose.
	named := attioServerExpectingNoCall(t)
	attioDouble := attioServerExpectingNoCall(t)
	payload := settingsPayload(nil)
	payload["attioApiUrl"] = named.URL

	consumer := newTestConsumer(t, &fakeStore{}, attioDouble.URL, payload)

	if err := consumer.Consume(context.Background(), customerCreatedEvent()); err != nil {
		t.Fatalf("settings naming another URL must be consumed rather than retried, got: %v", err)
	}
}

func TestConsumeTakesItsOrganizationFromThePrincipalNotTheEnvelope(t *testing.T) {
	created := 0
	server := attioServerCreating(t, "rec_new", "https://app.attio.com/w/acme", &created)
	store := &fakeStore{
		customerLink:    func(_ context.Context, _ string) (Link, error) { return Link{}, ErrLinkNotFound },
		setCustomerLink: func(_ context.Context, _ string, _ Link) error { return nil },
	}
	consumer := newTestConsumer(t, store, server.URL, settingsPayload(nil))

	// The envelope names a different organization than the principal does. The
	// principal wins, because internal/kaiten resolved it -- system:kaiten's row and
	// its membership -- from the envelope before binding it, and re-reading the
	// unvalidated field here would be trusting the wire twice. Both fakes fail the
	// test if asked about anything but testOrgID.
	event := customerCreatedEvent()
	event.OrganizationID = otherOrgID.String()

	if err := consumer.Consume(context.Background(), event); err != nil {
		t.Fatalf("expected the sync to succeed, got: %v", err)
	}
	if created != 1 {
		t.Fatalf("expected exactly one attio create, got %d", created)
	}
}

func TestConsumeSyncsEachOrganizationThroughItsOwnSettings(t *testing.T) {
	firstCreated, secondCreated := 0, 0
	firstServer := attioServerCreating(t, "rec_first", "https://app.attio.com/w/first", &firstCreated)
	secondServer := attioServerCreating(t, "rec_second", "https://app.attio.com/w/second", &secondCreated)

	newStore := func() *fakeStore {
		return &fakeStore{
			customerLink:    func(_ context.Context, _ string) (Link, error) { return Link{}, ErrLinkNotFound },
			setCustomerLink: func(_ context.Context, _ string, _ Link) error { return nil },
		}
	}

	first := newTestConsumer(t, newStore(), firstServer.URL, settingsPayload(nil))
	second := newTestConsumer(t, newStore(), secondServer.URL, settingsPayload(nil), withOrganization(otherOrgID))

	if err := first.Consume(context.Background(), customerCreatedEvent()); err != nil {
		t.Fatalf("first organization's sync failed: %v", err)
	}

	event := customerCreatedEvent()
	event.OrganizationID = otherOrgID.String()
	if err := second.Consume(context.Background(), event); err != nil {
		t.Fatalf("second organization's sync failed: %v", err)
	}

	// One create each. The consumer is a process-wide singleton and the Attio client
	// is built per event from the acting organization's settings, so a leak between
	// the two would show up as a second create against one of these servers.
	if firstCreated != 1 || secondCreated != 1 {
		t.Fatalf("expected one create per organization, got %d and %d", firstCreated, secondCreated)
	}
}

// --- customer creation --------------------------------------------------------

func TestCustomerCreationSkipsWhenAlreadyLinked(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	store := &fakeStore{
		customerLink: func(_ context.Context, slug string) (Link, error) {
			if slug != "acme" {
				t.Errorf("unexpected customer slug: %q", slug)
			}
			return Link{ExternalID: "rec_existing"}, nil
		},
	}

	// Created events are delivered at least once, and a customer created FROM Attio
	// arrives already linked: creating again would duplicate the Attio record.
	if err := consume(t, store, server.URL, customerCreatedEvent()); err != nil {
		t.Fatalf("an already-linked customer must be skipped, got: %v", err)
	}
}

func TestCustomerCreationIsTerminalWhenTheCustomerIsGone(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	store := &fakeStore{
		customerLink: func(_ context.Context, _ string) (Link, error) { return Link{}, ErrRecordNotFound },
	}

	if err := consume(t, store, server.URL, customerCreatedEvent()); err != nil {
		t.Fatalf("a deleted customer has nothing left to sync and must not be retried, got: %v", err)
	}
}

func TestCustomerCreationRetriesWhenTheLinkReadFails(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	readErr := errors.New("database unavailable")
	store := &fakeStore{
		customerLink: func(_ context.Context, _ string) (Link, error) { return Link{}, readErr },
	}

	if err := consume(t, store, server.URL, customerCreatedEvent()); !errors.Is(err, readErr) {
		t.Fatalf("expected the transient read failure to ask for a redelivery, got: %v", err)
	}
}

func TestCustomerCreationCreatesTheCompanyAndLinksIt(t *testing.T) {
	created := 0
	server := attioServerCreating(t, "rec_new", "https://app.attio.com/w/acme", &created)

	var written Link
	var writtenSlug string
	store := &fakeStore{
		customerLink: func(_ context.Context, _ string) (Link, error) { return Link{}, ErrLinkNotFound },
		setCustomerLink: func(_ context.Context, slug string, link Link) error {
			writtenSlug, written = slug, link
			return nil
		},
	}

	if err := consume(t, store, server.URL, customerCreatedEvent()); err != nil {
		t.Fatalf("expected the creation to succeed, got: %v", err)
	}
	if created != 1 {
		t.Fatalf("expected exactly one attio create, got %d", created)
	}
	if writtenSlug != "acme" {
		t.Fatalf("expected the link to be written for acme, got %q", writtenSlug)
	}
	if written.ExternalID != "rec_new" {
		t.Fatalf("expected external id rec_new, got %q", written.ExternalID)
	}
	if written.WebURL != "https://app.attio.com/w/acme" {
		t.Fatalf("expected the attio web url to be written, got %q", written.WebURL)
	}
	if written.LastError != "" {
		t.Fatalf("a successful sync must write no error, got %q", written.LastError)
	}
}

func TestCustomerCreationSyncsTheDomainWithoutAMapping(t *testing.T) {
	valuesByPath := map[string]map[string]any{}
	server := attioServerCapturingCreate(t, "rec_new", "https://app.attio.com/w/acme", valuesByPath)
	store := &fakeStore{
		customerLink:    func(_ context.Context, _ string) (Link, error) { return Link{}, ErrLinkNotFound },
		setCustomerLink: func(_ context.Context, _ string, _ Link) error { return nil },
	}

	if err := consume(t, store, server.URL, customerCreatedEvent()); err != nil {
		t.Fatalf("expected the creation to succeed, got: %v", err)
	}

	// The domain goes to Attio's built-in `domains` attribute whether or not the
	// operator mapped it, because a company without one is not much of a company.
	domains, ok := valuesByPath["/v2/objects/companies/records"]["domains"].([]any)
	if !ok || len(domains) != 1 {
		t.Fatalf("expected one domain, got %#v", valuesByPath["/v2/objects/companies/records"]["domains"])
	}
	if entry, ok := domains[0].(map[string]any); !ok || entry["domain"] != "acme.com" {
		t.Fatalf("expected {domain: acme.com}, got %#v", domains[0])
	}
}

func TestConsumeIsTerminalOnAPayloadItCannotUse(t *testing.T) {
	server := attioServerExpectingNoCall(t)

	for name, data := range map[string]string{
		"not json":   `{`,
		"no id":      `{"slug":"acme","name":"Acme Corp"}`,
		"no slug":    `{"id":"cust_1","name":"Acme Corp"}`,
		"blank slug": `{"id":"cust_1","slug":"   ","name":"Acme Corp"}`,
	} {
		t.Run(name, func(t *testing.T) {
			event := customerCreatedEvent()
			event.Data = data

			// A payload that cannot be decoded looks identical on every redelivery, so
			// it is consumed and logged rather than retried forever.
			if err := consume(t, &fakeStore{}, server.URL, event); err != nil {
				t.Fatalf("expected a terminal skip, got: %v", err)
			}
		})
	}
}

// --- customer updates ---------------------------------------------------------

func TestCustomerUpdateRecordsAPermanentAttioErrorOnTheLink(t *testing.T) {
	server := attioServerAnswering(t, http.MethodPut, "/v2/objects/companies/records/rec_existing",
		http.StatusBadRequest, `{"code":"missing_value","message":"invalid name"}`)

	var written Link
	store := &fakeStore{
		customerLink: func(_ context.Context, _ string) (Link, error) { return Link{ExternalID: "rec_existing"}, nil },
		setCustomerLink: func(_ context.Context, _ string, link Link) error {
			written = link
			return nil
		},
	}

	// Terminal for the dispatcher -- no redelivery fixes a payload Attio rejects --
	// but recorded on the link, so the console can show why this customer stopped
	// syncing instead of only the logs knowing.
	if err := consume(t, store, server.URL, customerUpdatedEvent()); err != nil {
		t.Fatalf("a rejected payload must not be retried, got: %v", err)
	}
	if written.ExternalID != "rec_existing" {
		t.Fatalf("expected the error to be recorded on rec_existing, got %q", written.ExternalID)
	}
	if written.LastError == "" {
		t.Fatal("expected the permanent error to be recorded on the link")
	}
	if written.WebURL != "" {
		t.Fatalf("an error write-back must not claim a web url, got %q", written.WebURL)
	}
}

func TestCustomerUpdateDoesNotRecordATransientAttioError(t *testing.T) {
	server := attioServerAnswering(t, http.MethodPut, "/v2/objects/companies/records/rec_existing",
		http.StatusServiceUnavailable, `{"code":"unavailable","message":"try again"}`)
	store := &fakeStore{
		customerLink: func(_ context.Context, _ string) (Link, error) { return Link{ExternalID: "rec_existing"}, nil },
		// No setCustomerLink: writing "failed" for something about to be retried
		// would be a lie with a UI attached, so a call here fails the test.
	}

	if err := consume(t, store, server.URL, customerUpdatedEvent()); err == nil {
		t.Fatal("expected a transient Attio failure to ask for a redelivery")
	}
}

func TestCustomerUpdateRetriesWhenThePermanentErrorCannotBeRecorded(t *testing.T) {
	server := attioServerAnswering(t, http.MethodPut, "/v2/objects/companies/records/rec_existing",
		http.StatusBadRequest, `{"code":"missing_value","message":"invalid name"}`)
	writeErr := errors.New("database unavailable")
	store := &fakeStore{
		customerLink:    func(_ context.Context, _ string) (Link, error) { return Link{ExternalID: "rec_existing"}, nil },
		setCustomerLink: func(_ context.Context, _ string, _ Link) error { return writeErr },
	}

	// The Attio failure is terminal, but losing the record of it is not: without the
	// write the console would show a healthy link forever.
	if err := consume(t, store, server.URL, customerUpdatedEvent()); !errors.Is(err, writeErr) {
		t.Fatalf("expected the failed write-back to ask for a redelivery, got: %v", err)
	}
}

func TestCustomerUpdateClearsAPreviousErrorAndRefreshesTheWebURL(t *testing.T) {
	server := attioServerAnswering(t, http.MethodPut, "/v2/objects/companies/records/rec_existing",
		http.StatusOK, `{"data":{"id":{"record_id":"rec_existing"},"web_url":"https://app.attio.com/w/acme"}}`)

	var written Link
	store := &fakeStore{
		customerLink: func(_ context.Context, _ string) (Link, error) {
			return Link{ExternalID: "rec_existing", LastError: "invalid name"}, nil
		},
		setCustomerLink: func(_ context.Context, _ string, link Link) error {
			written = link
			return nil
		},
	}

	if err := consume(t, store, server.URL, customerUpdatedEvent()); err != nil {
		t.Fatalf("expected the update to succeed, got: %v", err)
	}
	if written.WebURL != "https://app.attio.com/w/acme" {
		t.Fatalf("expected the web url to be refreshed, got %q", written.WebURL)
	}
	// An empty LastError is the successful sync saying so: the console shows the
	// error next to the link until one does.
	if written.LastError != "" {
		t.Fatalf("expected the previous error to be cleared, got %q", written.LastError)
	}
}

func TestCustomerUpdateRetriesWhenTheSuccessfulLinkCannotBeWritten(t *testing.T) {
	server := attioServerAnswering(t, http.MethodPut, "/v2/objects/companies/records/rec_existing",
		http.StatusOK, `{"data":{"id":{"record_id":"rec_existing"}}}`)
	writeErr := errors.New("database unavailable")
	store := &fakeStore{
		customerLink:    func(_ context.Context, _ string) (Link, error) { return Link{ExternalID: "rec_existing"}, nil },
		setCustomerLink: func(_ context.Context, _ string, _ Link) error { return writeErr },
	}

	if err := consume(t, store, server.URL, customerUpdatedEvent()); !errors.Is(err, writeErr) {
		t.Fatalf("expected the failed link write to ask for a redelivery, got: %v", err)
	}
}

func TestCustomerUpdateCreatesTheMissingCompanyUnderCreateAndBind(t *testing.T) {
	created := 0
	server := attioServerCreating(t, "rec_new", "https://app.attio.com/w/acme", &created)

	writes := 0
	store := &fakeStore{
		customerLink: func(_ context.Context, _ string) (Link, error) { return Link{}, ErrLinkNotFound },
		setCustomerLink: func(_ context.Context, _ string, link Link) error {
			writes++
			if link.ExternalID != "rec_new" {
				t.Errorf("expected the new company id to be linked, got %q", link.ExternalID)
			}
			return nil
		},
	}

	// An update for a customer that predates the connector has no counterpart, and
	// create-and-bind brings it into Attio rather than failing forever. The create
	// already wrote this event's values, so nothing updates it again -- the no-call
	// server asserts the second write does not happen.
	if err := consume(t, store, server.URL, customerUpdatedEvent()); err != nil {
		t.Fatalf("expected create-and-bind to succeed, got: %v", err)
	}
	if created != 1 {
		t.Fatalf("expected exactly one attio create and no update, got %d creates", created)
	}
	if writes != 1 {
		t.Fatalf("expected exactly one link write, got %d", writes)
	}
}

func TestCustomerUpdateRefusesToCreateUnderFailAndRetry(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	store := &fakeStore{
		customerLink: func(_ context.Context, _ string) (Link, error) { return Link{}, ErrLinkNotFound },
	}
	consumer := newTestConsumer(t, store, server.URL, settingsPayload(nil), withSyncPolicy(SyncPolicyFailAndRetry))

	// For a deployment that treats Attio as the system of record, a missing
	// counterpart is somebody's problem rather than something to paper over.
	if err := consumer.Consume(context.Background(), customerUpdatedEvent()); err == nil {
		t.Fatal("expected fail-and-retry to refuse creating the missing company")
	}
}

// --- instance creation --------------------------------------------------------

func TestInstanceCreationSkipsWhenAlreadyLinked(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	store := &fakeStore{
		instanceLink: func(_ context.Context, slug string) (Link, error) {
			if slug != "acme-prod" {
				t.Errorf("unexpected instance slug: %q", slug)
			}
			return Link{ExternalID: "ws_existing"}, nil
		},
	}

	if err := consume(t, store, server.URL, instanceCreatedEvent()); err != nil {
		t.Fatalf("an already-linked instance must be skipped, got: %v", err)
	}
}

func TestInstanceCreationRetriesWhileItsCustomerIsNotLinkedYet(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	store := &fakeStore{
		instanceLink: func(_ context.Context, _ string) (Link, error) { return Link{}, ErrLinkNotFound },
		customerLink: func(_ context.Context, _ string) (Link, error) { return Link{}, ErrLinkNotFound },
	}

	// A workspace references its company, and the customer's own created event is
	// almost certainly still in flight: this is the ordering the outbox does not
	// promise, and a redelivery is exactly what fixes it.
	if err := consume(t, store, server.URL, instanceCreatedEvent()); err == nil {
		t.Fatal("expected an unlinked customer to ask for a redelivery of the instance")
	}
}

func TestInstanceCreationCreatesTheWorkspaceAndLinksIt(t *testing.T) {
	created := 0
	server := attioServerCreating(t, "ws_new", "https://app.attio.com/w/acme-prod", &created)

	var written Link
	store := &fakeStore{
		instanceLink: func(_ context.Context, _ string) (Link, error) { return Link{}, ErrLinkNotFound },
		customerLink: func(_ context.Context, slug string) (Link, error) {
			if slug != "acme" {
				t.Errorf("expected the instance's customer slug, got %q", slug)
			}
			return Link{ExternalID: "rec_company"}, nil
		},
		setInstanceLink: func(_ context.Context, _ string, link Link) error {
			written = link
			return nil
		},
		// No licence and no zone override: with nothing mapped the connector must
		// not read either, and a call fails the test.
	}

	if err := consume(t, store, server.URL, instanceCreatedEvent()); err != nil {
		t.Fatalf("expected the creation to succeed, got: %v", err)
	}
	if created != 1 {
		t.Fatalf("expected exactly one attio create, got %d", created)
	}
	if written.ExternalID != "ws_new" || written.WebURL != "https://app.attio.com/w/acme-prod" {
		t.Fatalf("unexpected instance link written: %+v", written)
	}
}

func TestInstanceCreationSyncsTheMappedLicenceAndZoneFields(t *testing.T) {
	valuesByPath := map[string]map[string]any{}
	server := attioServerCapturingCreate(t, "ws_new", "https://app.attio.com/w/acme-prod", valuesByPath)
	store := enrichedInstanceStore(t)

	if err := consume(t, store, server.URL, instanceCreatedEvent(), withMapping(enrichedFieldsMapping())); err != nil {
		t.Fatalf("expected the creation to succeed, got: %v", err)
	}

	values := valuesByPath["/v2/objects/workspaces/records"]
	for attribute, expected := range map[string]string{
		"kaiten_license_type":      "PAID",
		"kaiten_license_name":      "Enterprise License",
		"kaiten_license_starts_at": "2026-01-01",
		"kaiten_license_ends_at":   "2027-06-30",
		"kaiten_deployment_zone":   "AWS eu-west-1",
		"kaiten_lifecycle_stage":   "ACTIVE",
	} {
		if got := textValue(t, values, attribute); got != expected {
			t.Errorf("%s = %q, expected %q", attribute, got, expected)
		}
	}
}

func TestInstanceCreationOmitsTheZoneFieldWhenTheZoneIsGone(t *testing.T) {
	valuesByPath := map[string]map[string]any{}
	server := attioServerCapturingCreate(t, "ws_new", "https://app.attio.com/w/acme-prod", valuesByPath)
	store := enrichedInstanceStore(t)
	store.deploymentZone = func(_ context.Context, _ string) (string, error) { return "", ErrRecordNotFound }

	// Everything else about the instance is still true and still worth writing, so a
	// vanished zone drops its field rather than the sync.
	if err := consume(t, store, server.URL, instanceCreatedEvent(), withMapping(enrichedFieldsMapping())); err != nil {
		t.Fatalf("a vanished deployment zone must not fail the sync, got: %v", err)
	}

	values := valuesByPath["/v2/objects/workspaces/records"]
	if _, ok := values["kaiten_deployment_zone"]; ok {
		t.Errorf("expected the zone field to be omitted, got %#v", values["kaiten_deployment_zone"])
	}
	if got := textValue(t, values, "kaiten_license_type"); got != "PAID" {
		t.Errorf("the other mapped fields must still sync, got licence type %q", got)
	}
}

func TestInstanceCreationRetriesWhenTheLicenceLookupFails(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	lookupErr := errors.New("database unavailable")
	store := enrichedInstanceStore(t)
	store.license = func(_ context.Context, _ string) (License, error) { return License{}, lookupErr }

	err := consume(t, store, server.URL, instanceCreatedEvent(), withMapping(enrichedFieldsMapping()))
	if !errors.Is(err, lookupErr) {
		t.Fatalf("expected the transient licence lookup failure to ask for a redelivery, got: %v", err)
	}
}

func TestInstanceCreationIsTerminalWhenTheLicenceIsGone(t *testing.T) {
	server := attioServerExpectingNoCall(t)
	store := enrichedInstanceStore(t)
	store.license = func(_ context.Context, _ string) (License, error) { return License{}, ErrRecordNotFound }

	if err := consume(t, store, server.URL, instanceCreatedEvent(), withMapping(enrichedFieldsMapping())); err != nil {
		t.Fatalf("a deleted licence cannot be brought back by a redelivery, got: %v", err)
	}
}

// --- instance updates ---------------------------------------------------------

func TestInstanceUpdateRecordsAPermanentAttioErrorOnTheLink(t *testing.T) {
	server := attioServerAnswering(t, http.MethodPatch, "/v2/objects/workspaces/records/ws_existing",
		http.StatusBadRequest, `{"code":"missing_value","message":"invalid workspace"}`)

	var written Link
	store := &fakeStore{
		instanceLink: func(_ context.Context, _ string) (Link, error) { return Link{ExternalID: "ws_existing"}, nil },
		customerLink: func(_ context.Context, _ string) (Link, error) { return Link{ExternalID: "rec_company"}, nil },
		setInstanceLink: func(_ context.Context, _ string, link Link) error {
			written = link
			return nil
		},
	}

	if err := consume(t, store, server.URL, instanceUpdatedEvent()); err != nil {
		t.Fatalf("a rejected payload must not be retried, got: %v", err)
	}
	if written.ExternalID != "ws_existing" || written.LastError == "" {
		t.Fatalf("expected the permanent error to be recorded on ws_existing, got %+v", written)
	}
	if written.WebURL != "" {
		t.Fatalf("an error write-back must not claim a web url, got %q", written.WebURL)
	}
}

func TestInstanceUpdateCreatesTheMissingCompanyCarryingItsDomain(t *testing.T) {
	valuesByPath := map[string]map[string]any{}
	server := attioServerCapturingCreate(t, "rec_company", "https://app.attio.com/w/acme", valuesByPath)

	store := &fakeStore{
		instanceLink: func(_ context.Context, _ string) (Link, error) { return Link{}, ErrLinkNotFound },
		customerLink: func(_ context.Context, _ string) (Link, error) { return Link{}, ErrLinkNotFound },
		customer: func(_ context.Context, slug string) (Customer, error) {
			if slug != "acme" {
				t.Errorf("unexpected customer slug: %q", slug)
			}
			return Customer{Name: "Acme Corp", Domain: "acme.com"}, nil
		},
		setCustomerLink: func(_ context.Context, _ string, _ Link) error { return nil },
		setInstanceLink: func(_ context.Context, _ string, _ Link) error { return nil },
	}

	// Unlike the creation path, a missing customer link on an update can be created:
	// an update is evidence the customer has existed for a while, so waiting for its
	// created event is waiting for something that already happened. The domain comes
	// from the customer read, because the instance payload does not carry it.
	if err := consume(t, store, server.URL, instanceUpdatedEvent()); err != nil {
		t.Fatalf("expected create-and-bind to succeed, got: %v", err)
	}

	domains, ok := valuesByPath["/v2/objects/companies/records"]["domains"].([]any)
	if !ok || len(domains) != 1 {
		t.Fatalf("expected the company created from the instance path to carry the domain, got %#v",
			valuesByPath["/v2/objects/companies/records"]["domains"])
	}
	if entry, ok := domains[0].(map[string]any); !ok || entry["domain"] != "acme.com" {
		t.Fatalf("expected {domain: acme.com}, got %#v", domains[0])
	}
}

// --- dates --------------------------------------------------------------------

func TestDateOnlyTruncatesWhatAttioRefuses(t *testing.T) {
	// Attio's date attributes reject full timestamps, and a value that is already a
	// date -- or is not a date at all -- passes through rather than being refused.
	cases := map[string]string{
		"2026-01-01T00:00:00Z":      "2026-01-01",
		"2027-06-30T12:30:00+02:00": "2027-06-30",
		"  not-a-date  ":            "not-a-date",
		"":                          "",
	}

	for input, expected := range cases {
		if got := dateOnly(input); got != expected {
			t.Errorf("dateOnly(%q) = %q, expected %q", input, got, expected)
		}
	}
}

// --- shared driver ------------------------------------------------------------

func withMapping(mapping map[string]string) consumerOption {
	return func(_ *Deps, settings *fakeSettings, _ *fakeActivations) {
		raw := make(map[string]any, len(mapping))
		for source, attribute := range mapping {
			raw[source] = attribute
		}
		settings.payload["fieldsMapping"] = raw
	}
}

// consume drives the whole consumer rather than a sub-handler, so every test above
// goes through the activation check, the settings resolution and the dispatch the
// dispatcher would go through.
func consume(t *testing.T, store KaitenStore, attioURL string, event debezium.Event, opts ...consumerOption) error {
	t.Helper()

	return newTestConsumer(t, store, attioURL, settingsPayload(nil), opts...).Consume(context.Background(), event)
}
