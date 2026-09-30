// Package webhookcontract_test is the fitness function for the published
// webhook contracts.
//
// It works by enumerating events.Catalogue() -- every events.Metadata built
// with events.New, i.e. every outbox event type in the binary -- so an event
// type added without a webhook contract fails here rather than reaching a
// subscriber undocumented.
package webhookcontract_test

import (
	"context"
	"encoding/json"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/server"
	ffschema "github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// TestEveryEmittedEventTypeIsPublished asserts the two halves of each contract
// agree: every declared outbox event type has a webhook entry, and every
// webhook entry names an event type something actually emits. It also pins the
// envelope's name/type enums to the constant the handler passes to
// outbox.NewOutboxMessage.
func TestEveryEmittedEventTypeIsPublished(t *testing.T) {
	oapi := openAPIDocument(t)

	catalogue := make(map[string]events.Metadata, len(events.Catalogue()))
	for _, metadata := range events.Catalogue() {
		if previous, duplicate := catalogue[metadata.Type]; duplicate {
			t.Fatalf("event type %q declared twice (%q and %q)", metadata.Type, previous.Name, metadata.Name)
		}
		catalogue[metadata.Type] = metadata
	}

	var undeclared []string
	for eventType := range catalogue {
		if _, ok := oapi.Webhooks[eventType]; !ok {
			undeclared = append(undeclared, eventType)
		}
	}
	if len(undeclared) > 0 {
		sort.Strings(undeclared)
		t.Errorf("emitted event types with no published webhook contract: %v", undeclared)
	}

	var phantom []string
	for eventType := range oapi.Webhooks {
		if _, ok := catalogue[eventType]; !ok {
			phantom = append(phantom, eventType)
		}
	}
	if len(phantom) > 0 {
		sort.Strings(phantom)
		t.Errorf("webhook contracts published for event types nothing emits: %v", phantom)
	}

	for eventType, metadata := range catalogue {
		item, ok := oapi.Webhooks[eventType]
		if !ok {
			continue
		}
		envelope := envelopeSchema(t, eventType, item)
		assertConstantEnum(t, eventType, envelope, "name", metadata.Name)
		assertConstantEnum(t, eventType, envelope, "type", metadata.Type)
	}
}

// TestEveryWebhookPayloadValidatesAgainstItsSchema marshals a fully populated
// instance of the Go type each webhook declares as its payload -- the same
// type the handler hands to outbox.NewOutboxMessage -- and validates the whole
// {name, type, data} envelope against the schema the OpenAPI document
// declares for that event type.
func TestEveryWebhookPayloadValidatesAgainstItsSchema(t *testing.T) {
	oapi := openAPIDocument(t)
	registry := oapi.Components.Schemas

	for eventType, item := range oapi.Webhooks {
		t.Run(eventType, func(t *testing.T) {
			envelope := envelopeSchema(t, eventType, item)

			data, ok := envelope.Properties["data"]
			if !ok || data.Ref == "" {
				t.Fatalf("webhook %q does not declare its payload as a named schema; declare Data as the type the handler emits", eventType)
			}
			payloadType := registry.TypeFromRef(data.Ref)
			if payloadType == nil {
				t.Fatalf("webhook %q references unknown schema %q", eventType, data.Ref)
			}

			payload := reflect.New(payloadType)
			fill(t, payload.Elem(), "", payloadType.Name(), 0)

			body, err := json.Marshal(map[string]any{
				"name": enumValue(t, envelope.Properties["name"]),
				"type": eventType,
				"data": payload.Interface(),
			})
			if err != nil {
				t.Fatalf("marshal payload: %v", err)
			}

			var decoded any
			if err := json.Unmarshal(body, &decoded); err != nil {
				t.Fatalf("unmarshal payload: %v", err)
			}

			result := &huma.ValidateResult{}
			// ModeReadFromServer: a webhook is delivered by the server, so
			// readOnly fields are expected and writeOnly fields must not appear.
			huma.Validate(registry, envelope, huma.NewPathBuffer([]byte(""), 0), huma.ModeReadFromServer, decoded, result)
			for _, err := range result.Errors {
				t.Errorf("payload does not satisfy the published schema: %v", err)
			}
			if len(result.Errors) > 0 {
				t.Logf("payload was: %s", body)
			}
		})
	}
}

// secretFieldNames are field and property names that, on a webhook payload, would
// mean a live credential leaves the process. A webhook payload is delivered to a
// subscriber's HTTP endpoint and is stored in an outbox row on the way there, so a
// secret in one is a secret written to the database and posted to a third party.
//
// "token" is the specific hazard this was written for: identity/schema.PlainToken
// carries a credential's plaintext as `json:"token"`, and it is the type the mint
// handler and every service-account token creation publish. Reusing one as a
// webhook payload would compile, validate, and quietly distribute a working
// credential. "value" is deliberately absent -- feature-flag payloads legitimately
// carry one -- and PlainToken is caught anyway, by the json name it publishes
// rather than by its Go field name.
var secretFieldNames = map[string]bool{
	"token": true, "secret": true, "password": true, "plaintext": true,
	"hash": true, "lookuphash": true, "apikey": true, "privatekey": true,
	"signingkey": true, "credential": true,
}

// TestNoWebhookPayloadCanCarryASecret walks every published payload type, field by
// field and into nested structs, and fails on a name that means "this is the
// secret".
//
// It is a name check, which cannot prove a payload is secret-free -- a field called
// "reference" could hold anything. It is here for what it does prove: that the
// obvious mistake is caught by the build rather than by a reviewer noticing, for
// every payload in the binary and every payload added later.
func TestNoWebhookPayloadCanCarryASecret(t *testing.T) {
	oapi := openAPIDocument(t)
	registry := oapi.Components.Schemas

	for eventType, item := range oapi.Webhooks {
		t.Run(eventType, func(t *testing.T) {
			envelope := envelopeSchema(t, eventType, item)

			data, ok := envelope.Properties["data"]
			if !ok || data.Ref == "" {
				t.Fatalf("webhook %q does not declare its payload as a named schema", eventType)
			}
			payloadType := registry.TypeFromRef(data.Ref)
			if payloadType == nil {
				t.Fatalf("webhook %q references unknown schema %q", eventType, data.Ref)
			}

			assertNoSecretFields(t, payloadType, payloadType.Name(), 0)
		})
	}
}

func assertNoSecretFields(t *testing.T, structType reflect.Type, path string, depth int) {
	t.Helper()

	for structType.Kind() == reflect.Pointer || structType.Kind() == reflect.Slice {
		structType = structType.Elem()
	}
	if structType.Kind() != reflect.Struct || depth > maxFillDepth {
		return
	}

	for i := range structType.NumField() {
		field := structType.Field(i)
		if !field.IsExported() {
			continue
		}

		name := path + "." + field.Name
		jsonName := strings.Split(field.Tag.Get("json"), ",")[0]

		for _, candidate := range []string{field.Name, jsonName} {
			if secretFieldNames[strings.ToLower(strings.ReplaceAll(candidate, "_", ""))] {
				t.Errorf("webhook payload field %s (json %q) is named like a credential; "+
					"a webhook payload is stored in an outbox row and posted to a subscriber, "+
					"so it must never carry one", name, jsonName)
			}
		}

		assertNoSecretFields(t, field.Type, name, depth+1)
	}
}

// TestPlatformDocumentPublishesNoWebhooks pins where a webhook contract is
// allowed to live, which the two tests above cannot see on their own: they read
// the Core document only, so a contract declared on the Platform document would
// make an emitted event type look undeclared and a phantom contract look absent
// -- two failures pointing away from the actual mistake.
//
// Core is the right document even for an event a Platform operation emits, and
// the direction is not arbitrary. A webhook contract exists for whoever receives
// the delivery, and every outbox event carries a NOT NULL organization_id, so the
// recipient is always a tenant -- and tenants read the Core document. The Platform
// document is what the platform itself calls; nothing subscribes to it. See
// mintorganizationtoken.RegisterWebhook, which emits from the Platform surface and
// declares on the Core one for exactly this reason.
func TestPlatformDocumentPublishesNoWebhooks(t *testing.T) {
	platform := platformAPIDocument(t)

	var published []string
	for eventType := range platform.Webhooks {
		published = append(published, eventType)
	}
	if len(published) > 0 {
		sort.Strings(published)
		t.Errorf("webhook contracts declared on the Platform document: %v -- "+
			"declare them on the Core document, which is the one subscribers read; "+
			"the catalogue check in this package only reads Core", published)
	}
}

func openAPIDocument(t *testing.T) *huma.OpenAPI {
	t.Helper()

	return newServer(t).API().OpenAPI()
}

func platformAPIDocument(t *testing.T) *huma.OpenAPI {
	t.Helper()

	return newServer(t).PlatformAPI().OpenAPI()
}

func newServer(t *testing.T) *server.Server {
	t.Helper()

	srv, err := server.New(context.Background(), server.Dependencies{
		Auth:         nil,
		UserProvider: nil,
		DB:           nil,
	}, config.Config{})
	if err != nil {
		t.Fatalf("server.New() error = %v", err)
	}
	return srv
}

func envelopeSchema(t *testing.T, eventType string, item *huma.PathItem) *huma.Schema {
	t.Helper()

	if item.Post == nil || item.Post.RequestBody == nil {
		t.Fatalf("webhook %q has no POST request body", eventType)
	}
	media, ok := item.Post.RequestBody.Content["application/json"]
	if !ok || media.Schema == nil {
		t.Fatalf("webhook %q has no application/json schema", eventType)
	}
	return media.Schema
}

func assertConstantEnum(t *testing.T, eventType string, envelope *huma.Schema, property, want string) {
	t.Helper()

	got := enumValue(t, envelope.Properties[property])
	if got != want {
		t.Errorf("webhook %q declares %s=%q but the handler emits %q", eventType, property, got, want)
	}
}

func enumValue(t *testing.T, s *huma.Schema) string {
	t.Helper()

	if s == nil || len(s.Enum) != 1 {
		t.Fatalf("expected a single-value enum, got %#v", s)
	}
	value, ok := s.Enum[0].(string)
	if !ok {
		t.Fatalf("expected a string enum value, got %#v", s.Enum[0])
	}
	return value
}

var (
	sampleTime = time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	sampleUUID = uuid.MustParse("123e4567-e89b-12d3-a456-426614174000")

	timeType = reflect.TypeOf(time.Time{})
	uuidType = reflect.TypeOf(uuid.UUID{})
)

// overrides supplies a sample for the handful of payload members whose
// published schema is hand-written (huma.SchemaProvider) rather than derived
// from their Go shape, so the filler cannot infer a conforming value from the
// struct alone. Each one is a discriminated union.
var overrides = map[reflect.Type]any{
	reflect.TypeOf(licenseschema.LicenseEntitlementValue{}): licenseschema.LicenseEntitlementValue{
		"type":  "number",
		"value": 1,
	},
	reflect.TypeOf(instanceschema.EntitlementValue{}): instanceschema.EntitlementValue{
		Number: &instanceschema.NumberEntitlementValue{Type: "number", Value: 1, EventCount: 1},
	},
	reflect.TypeOf(ffschema.DefaultVariant{}): ffschema.DefaultVariant{
		Type:  ffschema.BasicType,
		Value: ffschema.BasicVariant("on"),
	},
}

// maxFillDepth stops the filler from following a payload type that nests
// itself; no current payload does, and the bound keeps a future one from
// hanging the suite.
const maxFillDepth = 8

// fill populates v so that marshalling it exercises every published property
// of its schema. Values come from the field's own enum/example tags where it
// has them, which is what keeps the generated payload inside the pattern,
// enum and format constraints huma derived from those same tags.
func fill(t *testing.T, v reflect.Value, tag reflect.StructTag, path string, depth int) {
	t.Helper()

	if depth > maxFillDepth || !v.CanSet() {
		return
	}

	if override, ok := overrides[v.Type()]; ok {
		v.Set(reflect.ValueOf(override))
		return
	}

	switch v.Type() {
	case uuidType:
		v.Set(reflect.ValueOf(sampleUUID))
		return
	case timeType:
		v.Set(reflect.ValueOf(sampleTime))
		return
	}

	switch v.Kind() {
	case reflect.Pointer:
		v.Set(reflect.New(v.Type().Elem()))
		fill(t, v.Elem(), tag, path, depth+1)

	case reflect.Struct:
		for i := range v.NumField() {
			field := v.Type().Field(i)
			if !field.IsExported() || jsonName(field) == "-" || field.Tag.Get("writeOnly") == "true" {
				continue
			}
			fill(t, v.Field(i), field.Tag, path+"."+field.Name, depth+1)
		}

	case reflect.String:
		if s, ok := stringValue(tag); ok {
			v.SetString(s)
		}

	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		v.SetInt(1)

	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		v.SetUint(1)

	case reflect.Float32, reflect.Float64:
		v.SetFloat(1)

	case reflect.Bool:
		v.SetBool(true)

	case reflect.Map:
		v.Set(reflect.MakeMap(v.Type()))

	case reflect.Slice:
		if v.Type().Elem().Kind() == reflect.Uint8 {
			v.SetBytes([]byte("sample"))
			return
		}
		// An element behind a non-empty interface has no single concrete
		// implementation to pick, so publish the empty list rather than a
		// null element.
		if elem := v.Type().Elem(); elem.Kind() == reflect.Interface && elem.NumMethod() > 0 {
			v.Set(reflect.MakeSlice(v.Type(), 0, 0))
			return
		}
		v.Set(reflect.MakeSlice(v.Type(), 1, 1))
		fill(t, v.Index(0), tag, path+"[0]", depth+1)

	case reflect.Interface:
		if v.NumMethod() == 0 {
			v.Set(reflect.ValueOf("sample"))
		}

	default:
		t.Fatalf("no sample value for %s (%s); teach the filler about it", path, v.Type())
	}
}

// stringValue picks a value the field's own constraints accept: the first
// enum member, else the documented example, else a slug-safe placeholder. A
// patterned field with neither reports false rather than guessing, so the
// property is simply omitted instead of failing validation on a value nobody
// intended.
func stringValue(tag reflect.StructTag) (string, bool) {
	if enum := tag.Get("enum"); enum != "" {
		return strings.Split(enum, ",")[0], true
	}
	if example := tag.Get("example"); example != "" {
		return example, true
	}
	if tag.Get("pattern") != "" || tag.Get("format") != "" {
		return "", false
	}
	if minLength := tag.Get("minLength"); minLength != "" {
		if n, err := strconv.Atoi(minLength); err == nil && n > len("sample") {
			return strings.Repeat("a", n), true
		}
	}
	return "sample", true
}

func jsonName(field reflect.StructField) string {
	name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
	if name == "" {
		return field.Name
	}
	return name
}
