package attio

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/attio/attioclient"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/pkg/debezium"
)

// The event types this connector reacts to.
//
// Dispatch is on the versioned type, not the display name: the API renamed the names
// (CUSTOMER_CREATION -> CUSTOMER_CREATED) while the com.kaiten.*.v1.* types stayed
// stable across that rename, which is the whole reason they exist.
const (
	eventCustomerCreated = "com.kaiten.customer.v1.created"
	eventCustomerUpdated = "com.kaiten.customer.v1.updated"
	eventInstanceCreated = "com.kaiten.instance.v1.created"
	eventInstanceUpdated = "com.kaiten.instance.v1.updated"
)

// Deps is what the consumer needs, and nothing else.
type Deps struct {
	UserProvider currentuser.Provider
	Settings     SettingsReader
	Activations  ActivationReader
	Store        KaitenStore
}

// ActivationReader answers whether an organization has this connector switched on.
//
// Checked per event rather than assumed, because activation is what an organization
// controls: a connector deactivated while events are in flight must stop syncing, and
// the inbox mark for the events it skips is what stops them coming back.
type ActivationReader interface {
	Activated(ctx context.Context, organizationID uuid.UUID, connectorName string) (bool, error)
}

// Consumer syncs Kaiten customers and instances into Attio.
type Consumer struct {
	deps Deps
	// attioURL is where every request goes: attioclient.BaseURL, never a URL read
	// from settings. It is a field rather than the constant only so this package's
	// tests can point it at a double.
	attioURL string
}

func New(deps Deps) *Consumer {
	return &Consumer{deps: deps, attioURL: attioclient.BaseURL}
}

// Name implements cdc.Consumer.
func (c *Consumer) Name() string { return ConsumerName }

// Wants implements cdc.Consumer: only the four events this connector mirrors.
//
// Filtering here rather than inside Consume is what keeps the inbox honest. A
// consumer that answered true for everything and then did nothing would leave a mark
// against every event in the stream -- and a later widening of this filter would find
// them all already consumed.
func (c *Consumer) Wants(event debezium.Event) bool {
	switch event.EventType {
	case eventCustomerCreated, eventCustomerUpdated, eventInstanceCreated, eventInstanceUpdated:
		return true
	default:
		return false
	}
}

// Consume implements cdc.Consumer.
//
// It returns an error only for failures a redelivery might fix. Everything else is
// terminal and answers nil, which lets the dispatcher record the event as consumed:
// a malformed payload, a customer that no longer exists, or an organization that has
// not configured the connector will look exactly the same on every redelivery, and
// asking for one would be an endless loop rather than a recovery.
func (c *Consumer) Consume(ctx context.Context, event debezium.Event) error {
	user, err := c.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	settings, err := c.resolve(ctx, user.OrganizationID, event)
	if err != nil || settings == nil {
		return err
	}

	runtime := eventRuntime{
		attio:      attioclient.New(c.attioURL, settings.APIKey, slog.Default()),
		store:      c.deps.Store,
		syncPolicy: settings.SyncPolicy,
		fieldsMap:  settings.FieldsMapping,
	}

	// The most common silent misconfiguration: with no mapping the connector syncs
	// only its built-in fields and every field configured in the console is dropped.
	// An empty mapping is legitimate, so this is a warning rather than a refusal.
	if len(runtime.fieldsMap) == 0 {
		slog.WarnContext(ctx, "attio: no field mapping configured, syncing default fields only",
			slog.String("event_id", event.ID),
			slog.String("organization_id", user.OrganizationID.String()))
	}

	err = c.dispatch(ctx, event, runtime)

	var terminal *terminalError
	if errors.As(err, &terminal) {
		slog.ErrorContext(ctx, "attio: sync failed permanently, not retrying",
			slog.String("event_id", event.ID),
			slog.String("event_type", event.EventType),
			slog.String("organization_id", user.OrganizationID.String()),
			slog.String("error", terminal.err.Error()))
		return nil
	}

	return err
}

// resolve returns the settings this organization's sync runs under, or nil when there
// is nothing to do.
//
// Both "not activated" and "not configured" are nothing-to-do rather than failures.
// An organization that never switched the connector on has no opinion about this
// event, and one whose settings are missing cannot be fixed by redelivering: the
// event is recorded as consumed and the console shows the connector as inactive,
// which is the state the operator has to act on anyway.
func (c *Consumer) resolve(
	ctx context.Context, organizationID uuid.UUID, event debezium.Event,
) (*RuntimeSettings, error) {
	activated, err := c.deps.Activations.Activated(ctx, organizationID, Name)
	if err != nil {
		return nil, fmt.Errorf("attio: read activation: %w", err)
	}
	if !activated {
		return nil, nil
	}

	payload, err := c.deps.Settings.Get(ctx, organizationID, Name)
	if err != nil {
		// A store that cannot be read is transient -- Vault being unreachable is
		// exactly the failure a redelivery fixes -- and is told apart from settings
		// that are absent, which the resolver below reports as ErrNotConfigured.
		return nil, fmt.Errorf("attio: read settings: %w", err)
	}

	settings, err := resolveSettings(payload)
	if err != nil {
		slog.WarnContext(ctx, "attio: connector is activated but not configured, skipping event",
			slog.String("event_id", event.ID),
			slog.String("organization_id", organizationID.String()),
			slog.String("error", err.Error()))
		return nil, nil
	}

	return &settings, nil
}

func (c *Consumer) dispatch(ctx context.Context, event debezium.Event, runtime eventRuntime) error {
	switch event.EventType {
	case eventCustomerCreated:
		return c.customerCreated(ctx, event, runtime)
	case eventCustomerUpdated:
		return c.customerUpdated(ctx, event, runtime)
	case eventInstanceCreated:
		return c.instanceCreated(ctx, event, runtime)
	case eventInstanceUpdated:
		return c.instanceUpdated(ctx, event, runtime)
	default:
		// Unreachable: Wants already refused everything else. Answering nil rather
		// than erroring keeps the two in step if one day it is not.
		return nil
	}
}

// eventRuntime is everything one event's sync needs, resolved once per event because
// all of it comes from the organization's own settings.
type eventRuntime struct {
	attio      *attioclient.Client
	store      KaitenStore
	syncPolicy SyncPolicy
	fieldsMap  map[string]string
}

// terminalError marks a failure no redelivery can fix.
//
// It exists because this consumer has three outcomes and its caller has two. The
// dispatcher reads an error as "redeliver", so a permanent failure returned plainly
// would be retried until the broker gave up -- and one swallowed silently would be
// invisible. Wrapping says which it is at the point that knows.
type terminalError struct{ err error }

func (e *terminalError) Error() string { return e.err.Error() }
func (e *terminalError) Unwrap() error { return e.err }

func terminal(format string, args ...any) error {
	return &terminalError{err: fmt.Errorf(format, args...)}
}

// --- customers ---------------------------------------------------------------

type customerPayload struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Slug   string `json:"slug"`
	Domain string `json:"domain"`
}

func (c *Consumer) customerCreated(ctx context.Context, event debezium.Event, runtime eventRuntime) error {
	payload, err := decodeCustomer(event)
	if err != nil {
		return err
	}

	// Created events are delivered at-least-once, and a customer created FROM Attio
	// data already arrives carrying an integration -- so creating again would
	// duplicate the Attio record rather than converge on it.
	_, err = runtime.store.CustomerLink(ctx, payload.Slug)
	switch {
	case err == nil:
		return nil
	case errors.Is(err, ErrRecordNotFound):
		return terminal("customer %q no longer exists", payload.Slug)
	case !errors.Is(err, ErrLinkNotFound):
		return fmt.Errorf("read customer link: %w", err)
	}

	companyID, webURL, retry, err := runtime.attio.CreateCompany(
		ctx, payload.ID, payload.Name, customerSourceFields(payload), runtime.fieldsMap)
	if err != nil {
		return classify(retry, "create attio company for customer %q: %w", payload.Slug, err)
	}
	if companyID == "" {
		slog.WarnContext(ctx, "attio: company created without an id, customer left unlinked",
			slog.String("event_id", event.ID), slog.String("customer_slug", payload.Slug))
		return nil
	}

	if err := runtime.store.SetCustomerLink(ctx, payload.Slug, Link{ExternalID: companyID, WebURL: webURL}); err != nil {
		return fmt.Errorf("link customer %q to attio company %q: %w", payload.Slug, companyID, err)
	}

	slog.InfoContext(ctx, "attio: customer synced",
		slog.String("event_id", event.ID),
		slog.String("customer_slug", payload.Slug),
		slog.String("attio_company_id", companyID))

	return nil
}

func (c *Consumer) customerUpdated(ctx context.Context, event debezium.Event, runtime eventRuntime) error {
	payload, err := decodeCustomer(event)
	if err != nil {
		return err
	}

	companyID, created, err := c.companyForCustomerUpdate(ctx, payload, runtime)
	if err != nil {
		return err
	}
	if created {
		// create-and-bind already wrote the record with this event's values, so
		// updating it again would be the same write twice.
		return nil
	}

	webURL, retry, err := runtime.attio.UpdateCompany(
		ctx, companyID, payload.Name, customerSourceFields(payload), runtime.fieldsMap)
	if err != nil {
		// A permanent failure is recorded ON the link, so the console can show why a
		// customer stopped syncing instead of only the logs knowing. A transient one
		// is not: it is about to be retried, and writing "failed" for something still
		// in flight would be a lie with a UI attached.
		if !retry {
			link := Link{ExternalID: companyID, LastError: err.Error()}
			if stateErr := runtime.store.SetCustomerLink(ctx, payload.Slug, link); stateErr != nil {
				return fmt.Errorf("record customer sync error: %w", stateErr)
			}
		}
		return classify(retry, "update attio company %q: %w", companyID, err)
	}

	if err := runtime.store.SetCustomerLink(ctx, payload.Slug, Link{ExternalID: companyID, WebURL: webURL}); err != nil {
		return fmt.Errorf("clear customer sync error: %w", err)
	}

	slog.InfoContext(ctx, "attio: customer update synced",
		slog.String("event_id", event.ID),
		slog.String("customer_slug", payload.Slug),
		slog.String("attio_company_id", companyID))

	return nil
}

// companyForCustomerUpdate finds the Attio company an update should write to, creating
// one when the sync policy says to.
//
// An update for a customer created before the connector was switched on has no
// counterpart, and the two policies disagree about what that means: create-and-bind
// brings it into Attio, fail-and-retry treats a missing counterpart as somebody's
// problem rather than something to paper over.
func (c *Consumer) companyForCustomerUpdate(
	ctx context.Context, payload customerPayload, runtime eventRuntime,
) (companyID string, created bool, err error) {
	link, err := runtime.store.CustomerLink(ctx, payload.Slug)
	switch {
	case err == nil:
		return link.ExternalID, false, nil
	case errors.Is(err, ErrRecordNotFound):
		return "", false, terminal("customer %q no longer exists", payload.Slug)
	case !errors.Is(err, ErrLinkNotFound):
		return "", false, fmt.Errorf("read customer link: %w", err)
	}

	if runtime.syncPolicy == SyncPolicyFailAndRetry {
		return "", false, fmt.Errorf("customer %q has no attio company and the sync policy forbids creating one", payload.Slug)
	}

	companyID, webURL, retry, err := runtime.attio.CreateCompany(
		ctx, payload.ID, payload.Name, customerSourceFields(payload), runtime.fieldsMap)
	if err != nil {
		return "", false, classify(retry, "create attio company for customer %q: %w", payload.Slug, err)
	}
	if strings.TrimSpace(companyID) == "" {
		return "", false, fmt.Errorf("attio returned no company id while binding customer %q", payload.Slug)
	}

	if err := runtime.store.SetCustomerLink(ctx, payload.Slug, Link{ExternalID: companyID, WebURL: webURL}); err != nil {
		return "", false, fmt.Errorf("link customer %q to attio company %q: %w", payload.Slug, companyID, err)
	}

	return companyID, true, nil
}

// --- instances ---------------------------------------------------------------

type instancePayload struct {
	ID                 string `json:"id"`
	Slug               string `json:"slug"`
	Name               string `json:"name"`
	CustomerID         string `json:"customerId"`
	CustomerSlug       string `json:"customerSlug"`
	LicenseSlug        string `json:"licenseSlug"`
	StartLicenseDate   string `json:"startLicenseDate"`
	EndLicenseDate     string `json:"endLicenseDate"`
	DeploymentZoneSlug string `json:"deploymentZoneSlug"`
	LifecycleStage     string `json:"lifecycleStage"`
}

func (c *Consumer) instanceCreated(ctx context.Context, event debezium.Event, runtime eventRuntime) error {
	payload, err := decodeInstance(event)
	if err != nil {
		return err
	}

	// Same at-least-once guard as customer creation: an already-linked instance must
	// not get a second Attio workspace.
	_, err = runtime.store.InstanceLink(ctx, payload.Slug)
	switch {
	case err == nil:
		return nil
	case errors.Is(err, ErrRecordNotFound):
		return terminal("instance %q no longer exists", payload.Slug)
	case !errors.Is(err, ErrLinkNotFound):
		return fmt.Errorf("read instance link: %w", err)
	}

	// A workspace references its company, so the customer has to be in Attio first.
	// Missing is RETRYABLE rather than terminal: the customer's own created event is
	// almost certainly still in flight, and this is the ordering the outbox does not
	// promise.
	companyLink, err := runtime.store.CustomerLink(ctx, payload.CustomerSlug)
	switch {
	case err == nil:
	case errors.Is(err, ErrRecordNotFound):
		return terminal("customer %q of instance %q no longer exists", payload.CustomerSlug, payload.Slug)
	case errors.Is(err, ErrLinkNotFound):
		return fmt.Errorf("customer %q is not linked to attio yet, retrying instance %q", payload.CustomerSlug, payload.Slug)
	default:
		return fmt.Errorf("read customer link: %w", err)
	}

	sourceFields, err := c.instanceSourceFields(ctx, payload, companyLink.ExternalID, runtime)
	if err != nil {
		return err
	}

	workspaceID, webURL, retry, err := runtime.attio.CreateWorkspace(
		ctx, payload.ID, payload.Name, companyLink.ExternalID, sourceFields, runtime.fieldsMap)
	if err != nil {
		return classify(retry, "create attio workspace for instance %q: %w", payload.Slug, err)
	}
	if workspaceID == "" {
		slog.WarnContext(ctx, "attio: workspace created without an id, instance left unlinked",
			slog.String("event_id", event.ID), slog.String("instance_slug", payload.Slug))
		return nil
	}

	if err := runtime.store.SetInstanceLink(ctx, payload.Slug, Link{ExternalID: workspaceID, WebURL: webURL}); err != nil {
		return fmt.Errorf("link instance %q to attio workspace %q: %w", payload.Slug, workspaceID, err)
	}

	slog.InfoContext(ctx, "attio: instance synced",
		slog.String("event_id", event.ID),
		slog.String("instance_slug", payload.Slug),
		slog.String("attio_workspace_id", workspaceID))

	return nil
}

func (c *Consumer) instanceUpdated(ctx context.Context, event debezium.Event, runtime eventRuntime) error {
	payload, err := decodeInstance(event)
	if err != nil {
		return err
	}

	workspaceID, created, err := c.workspaceForInstanceUpdate(ctx, payload, runtime)
	if err != nil {
		return err
	}
	if created {
		return nil
	}

	companyID, err := c.companyForInstanceUpdate(ctx, payload, runtime)
	if err != nil {
		return err
	}

	sourceFields, err := c.instanceSourceFields(ctx, payload, companyID, runtime)
	if err != nil {
		return err
	}

	webURL, retry, err := runtime.attio.UpdateWorkspace(
		ctx, workspaceID, payload.ID, payload.Name, companyID, sourceFields, runtime.fieldsMap)
	if err != nil {
		if !retry {
			link := Link{ExternalID: workspaceID, LastError: err.Error()}
			if stateErr := runtime.store.SetInstanceLink(ctx, payload.Slug, link); stateErr != nil {
				return fmt.Errorf("record instance sync error: %w", stateErr)
			}
		}
		return classify(retry, "update attio workspace %q: %w", workspaceID, err)
	}

	if err := runtime.store.SetInstanceLink(ctx, payload.Slug, Link{ExternalID: workspaceID, WebURL: webURL}); err != nil {
		return fmt.Errorf("clear instance sync error: %w", err)
	}

	slog.InfoContext(ctx, "attio: instance update synced",
		slog.String("event_id", event.ID),
		slog.String("instance_slug", payload.Slug),
		slog.String("attio_workspace_id", workspaceID))

	return nil
}

func (c *Consumer) workspaceForInstanceUpdate(
	ctx context.Context, payload instancePayload, runtime eventRuntime,
) (workspaceID string, created bool, err error) {
	link, err := runtime.store.InstanceLink(ctx, payload.Slug)
	switch {
	case err == nil:
		return link.ExternalID, false, nil
	case errors.Is(err, ErrRecordNotFound):
		return "", false, terminal("instance %q no longer exists", payload.Slug)
	case !errors.Is(err, ErrLinkNotFound):
		return "", false, fmt.Errorf("read instance link: %w", err)
	}

	if runtime.syncPolicy == SyncPolicyFailAndRetry {
		return "", false, fmt.Errorf("instance %q has no attio workspace and the sync policy forbids creating one", payload.Slug)
	}

	companyID, err := c.companyForInstanceUpdate(ctx, payload, runtime)
	if err != nil {
		return "", false, err
	}

	sourceFields, err := c.instanceSourceFields(ctx, payload, companyID, runtime)
	if err != nil {
		return "", false, err
	}

	workspaceID, webURL, retry, err := runtime.attio.CreateWorkspace(
		ctx, payload.ID, payload.Name, companyID, sourceFields, runtime.fieldsMap)
	if err != nil {
		return "", false, classify(retry, "create attio workspace for instance %q: %w", payload.Slug, err)
	}
	if strings.TrimSpace(workspaceID) == "" {
		return "", false, fmt.Errorf("attio returned no workspace id while binding instance %q", payload.Slug)
	}

	if err := runtime.store.SetInstanceLink(ctx, payload.Slug, Link{ExternalID: workspaceID, WebURL: webURL}); err != nil {
		return "", false, fmt.Errorf("link instance %q to attio workspace %q: %w", payload.Slug, workspaceID, err)
	}

	return workspaceID, true, nil
}

// companyForInstanceUpdate finds the Attio company a workspace must reference.
//
// Unlike the creation path, a missing customer link here can be created: an update is
// evidence the customer has existed for a while, so waiting for its created event is
// waiting for something that already happened.
func (c *Consumer) companyForInstanceUpdate(
	ctx context.Context, payload instancePayload, runtime eventRuntime,
) (string, error) {
	link, err := runtime.store.CustomerLink(ctx, payload.CustomerSlug)
	switch {
	case err == nil:
		return link.ExternalID, nil
	case errors.Is(err, ErrRecordNotFound):
		return "", terminal("customer %q of instance %q no longer exists", payload.CustomerSlug, payload.Slug)
	case !errors.Is(err, ErrLinkNotFound):
		return "", fmt.Errorf("read customer link: %w", err)
	}

	if runtime.syncPolicy == SyncPolicyFailAndRetry {
		return "", fmt.Errorf("customer %q has no attio company and the sync policy forbids creating one", payload.CustomerSlug)
	}

	customer, err := runtime.store.Customer(ctx, payload.CustomerSlug)
	if err != nil {
		if errors.Is(err, ErrRecordNotFound) {
			return "", terminal("customer %q of instance %q no longer exists", payload.CustomerSlug, payload.Slug)
		}
		return "", fmt.Errorf("read customer %q: %w", payload.CustomerSlug, err)
	}
	if strings.TrimSpace(customer.Name) == "" {
		return "", terminal("customer %q has no name, cannot create an attio company for it", payload.CustomerSlug)
	}

	companyID, webURL, retry, err := runtime.attio.CreateCompany(
		ctx, payload.CustomerID, customer.Name,
		instanceCustomerSourceFields(payload, customer.Name, customer.Domain), runtime.fieldsMap)
	if err != nil {
		return "", classify(retry, "create attio company for customer %q: %w", payload.CustomerSlug, err)
	}
	if strings.TrimSpace(companyID) == "" {
		return "", fmt.Errorf("attio returned no company id while binding customer %q", payload.CustomerSlug)
	}

	if err := runtime.store.SetCustomerLink(ctx, payload.CustomerSlug, Link{ExternalID: companyID, WebURL: webURL}); err != nil {
		return "", fmt.Errorf("link customer %q to attio company %q: %w", payload.CustomerSlug, companyID, err)
	}

	return companyID, nil
}

// --- field mapping ------------------------------------------------------------

func customerSourceFields(payload customerPayload) map[string]string {
	return map[string]string{
		"customer.id":     payload.ID,
		"customer.slug":   payload.Slug,
		"customer.name":   payload.Name,
		"customer.domain": payload.Domain,
	}
}

func instanceCustomerSourceFields(payload instancePayload, customerName, customerDomain string) map[string]string {
	return map[string]string{
		"customer.id":     payload.CustomerID,
		"customer.slug":   payload.CustomerSlug,
		"customer.name":   customerName,
		"customer.domain": customerDomain,
	}
}

// instanceSourceFields builds an instance's fields, resolving the ones the event only
// references: the licence by its slug, the deployment zone by its id.
//
// The lookups run only when the corresponding field is actually mapped, so a
// deployment that maps neither pays for neither.
func (c *Consumer) instanceSourceFields(
	ctx context.Context, payload instancePayload, companyID string, runtime eventRuntime,
) (map[string]string, error) {
	fields := map[string]string{
		"instance.id":                 payload.ID,
		"instance.slug":               payload.Slug,
		"instance.name":               payload.Name,
		"instance.customerId":         payload.CustomerID,
		"instance.customerSlug":       payload.CustomerSlug,
		"instance.customerExternalId": companyID,
		"instance.licenseStartsAt":    dateOnly(payload.StartLicenseDate),
		"instance.licenseEndsAt":      dateOnly(payload.EndLicenseDate),
		"instance.lifecycleStage":     payload.LifecycleStage,
	}

	licenceMapped := attioclient.FieldMapped(runtime.fieldsMap, "instance.licenseType") ||
		attioclient.FieldMapped(runtime.fieldsMap, "instance.licenseName")
	if licenceMapped {
		switch {
		case strings.TrimSpace(payload.LicenseSlug) == "":
			slog.WarnContext(ctx, "attio: instance names no licence, licence fields not synced",
				slog.String("instance_slug", payload.Slug))
		default:
			licence, err := runtime.store.License(ctx, payload.LicenseSlug)
			if err != nil {
				if errors.Is(err, ErrRecordNotFound) {
					return nil, terminal("licence %q of instance %q no longer exists", payload.LicenseSlug, payload.Slug)
				}
				return nil, fmt.Errorf("read licence %q: %w", payload.LicenseSlug, err)
			}
			fields["instance.licenseName"] = licence.Name
			fields["instance.licenseType"] = licence.Type
		}
	}

	zoneSlug := strings.TrimSpace(payload.DeploymentZoneSlug)
	if attioclient.FieldMapped(runtime.fieldsMap, "instance.deploymentZone") && zoneSlug != "" {
		name, err := runtime.store.DeploymentZoneName(ctx, zoneSlug)
		switch {
		case err == nil:
			fields["instance.deploymentZone"] = name
		case errors.Is(err, ErrRecordNotFound):
			// A vanished zone must not block the rest of the sync: everything else
			// about the instance is still true and still worth writing.
			slog.WarnContext(ctx, "attio: deployment zone not found, field not synced",
				slog.String("instance_slug", payload.Slug),
				slog.String("deployment_zone_slug", zoneSlug))
		default:
			return nil, fmt.Errorf("read deployment zone %q: %w", zoneSlug, err)
		}
	}

	return fields, nil
}

// --- decoding -----------------------------------------------------------------

func decodeCustomer(event debezium.Event) (customerPayload, error) {
	var payload customerPayload
	if err := json.Unmarshal([]byte(event.Data), &payload); err != nil {
		return payload, terminal("decode customer payload of event %s: %w", event.ID, err)
	}

	switch {
	case payload.ID == "":
		return payload, terminal("customer payload of event %s has no id", event.ID)
	case strings.TrimSpace(payload.Slug) == "":
		return payload, terminal("customer payload of event %s has no slug", event.ID)
	}

	return payload, nil
}

func decodeInstance(event debezium.Event) (instancePayload, error) {
	var payload instancePayload
	if err := json.Unmarshal([]byte(event.Data), &payload); err != nil {
		return payload, terminal("decode instance payload of event %s: %w", event.ID, err)
	}

	switch {
	case payload.ID == "":
		return payload, terminal("instance payload of event %s has no id", event.ID)
	case strings.TrimSpace(payload.Slug) == "":
		return payload, terminal("instance payload of event %s has no slug", event.ID)
	case payload.CustomerID == "":
		return payload, terminal("instance payload of event %s has no customerId", event.ID)
	case strings.TrimSpace(payload.CustomerSlug) == "":
		return payload, terminal("instance payload of event %s has no customerSlug", event.ID)
	}

	return payload, nil
}

// classify turns the Attio client's retry flag into the error kind this consumer's
// caller understands. The client already decided -- 429, 408 and 5xx are worth
// another go, a rejected payload is not -- so this only translates.
func classify(retry bool, format string, args ...any) error {
	if retry {
		return fmt.Errorf(format, args...)
	}

	return terminal(format, args...)
}

// dateOnly truncates an RFC3339 timestamp to its date: Attio's date attributes reject
// full timestamps. Unparseable values pass through trimmed, because the mapping may
// legitimately point at something that is already a date.
func dateOnly(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return value
	}

	return parsed.Format("2006-01-02")
}
