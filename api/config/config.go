// Package config loads the API's configuration: an optional file -- YAML, TOML
// or JSON -- with environment variables over the top.
//
// Everything a setting is, is one row of the settings table below: its dotted
// key, the variable that sets it, whether it has a default, and whether it is a
// credential. viper does the rest -- format detection, coercion, precedence --
// and go-playground/validator says what a usable value looks like, in a tag next
// to the field it constrains.
package config

import (
	"errors"
	"fmt"
	"os"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/go-viper/mapstructure/v2"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/spf13/viper"

	"github.com/kaitencloud/kaiten/api/pkg/externalid"
)

// Config is everything the API server needs: CoreConfig, plus the settings that
// only mean something to a process serving requests.
type Config struct {
	// Squashed, not nested: the sections CoreConfig carries are top-level keys
	// in the file (`retention:`, `metered:`, `connectors:`), and the split
	// between core and server is a Go concern rather than a shape an operator
	// should have to know about.
	CoreConfig `mapstructure:",squash"`

	Server   Server
	Database Database
	Logging  Logging
	Otel     Otel
	// The tag is not redundant: mapstructure lowercases to "graphql" only by
	// accident of this name having no word boundary, and a rename would silently
	// move the key.
	GraphQL GraphQL `mapstructure:"graphql"`
}

// CoreConfig is the configuration the application itself reads: how long rows
// are kept, which organization is the platform's own, and where connector
// secrets live. It describes what the use cases do, never how a request reached
// them.
//
// It exists because a whole Config cannot be built by a process that does not
// serve HTTP: LoadConfig requires KAITEN_API_PORT. A driver that only wants the
// use cases supplies this instead.
//
// The split is by what a setting describes, not by which layer reads it today.
// Whole sections stay together -- the retention windows are one operator decision
// even though one sweep is started by the server and another by a module -- so a
// worker moving between layers does not drag fields across the boundary. Ports,
// OTel, log and GraphQL settings describe a server and stay on Config.
type CoreConfig struct {
	Retention  Retention
	Metered    Metered
	Connectors Connectors
	Usage      Usage
}

type Server struct {
	// Port is the PUBLIC listener: the Core API, and nothing else. Everything in
	// front of this service (Envoy, the Gateway API HTTPRoutes) routes /api here.
	Port uint `validate:"required"`

	// PlatformPort is the INTERNAL listener: /api/platform/** and its OpenAPI
	// document, served by a second Fiber app in this same process.
	//
	// A separate port rather than a prefix, because a prefix is a routing rule and
	// this is a trust boundary: the Platform API is reached by other internal
	// services and must not be addressable from the internet. Expose Port through
	// the gateway; leave this one on the pod network.
	//
	// Defaulted rather than required, unlike Port, so a deployment that does not
	// know the variable still gets its Platform API on the pod network. nefield
	// refuses a value equal to Port: two sockets in one process would race for it
	// and the loser would exit, and that is worth refusing at load with both
	// variables named rather than as an "address already in use".
	PlatformPort uint `mapstructure:"platform_port" validate:"required,nefield=Port"`
}

type Database struct {
	// ConnectionString is startup-fixed: read exactly once, at ConnectDB
	// (cmd/server/main.go), and required, so "absent now, arrives later" is not a
	// state this setting has -- the pool cannot be rebuilt from a changed value
	// anyway.
	//
	// secret: the chart refuses to render a values.yaml that names this key in
	// api.config at all. It arrives only from KAITEN_DATABASE_CONNECTION_STRING,
	// sourced by a secretKeyRef through envFrom -- the same BindEnv channel
	// every other setting uses, with no file-side mechanism involved.
	ConnectionString string `mapstructure:"connection_string" validate:"required"`
}

type Logging struct {
	Level  string `validate:"oneof=debug info warn error"`
	Format string `validate:"oneof=json text"`
}

// Otel configures OpenTelemetry. Off by default, and not silently:
// otelcommon.InitTracer logs the state it settled on at startup, so a deployment
// that forgot the variable does not look like one that set it.
type Otel struct {
	Enabled  bool
	Endpoint string
	// MetricsEndpoint is where metrics go, and has no default on purpose:
	// Endpoint is Jaeger in every environment we run, and Jaeger accepts
	// /v1/traces only -- pointing the metric reader at it meant every collection
	// cycle failed and was discarded. Set this to a collector that accepts OTLP
	// metrics, or leave it empty and get no metrics, which InitTracer says out
	// loud.
	MetricsEndpoint string `mapstructure:"metrics_endpoint"`
	ServiceName     string `mapstructure:"service_name"`
	Insecure        bool
	// TracesSamplingRatio is the head sampling probability for traces started
	// here; traces continued from an upstream decision are unaffected.
	TracesSamplingRatio float64 `mapstructure:"traces_sampling_ratio" validate:"gte=0,lte=1"`
	// Authorization is the collector's credential, and secret for the same reason
	// as the connection string: the exporter is built once at startup from
	// whatever this held, so there is nothing for a re-read to change.
	Authorization string
}

// GraphQL development affordances, both off unless a deployment opts in. The
// playground is an interactive console over the whole API and introspection is
// the schema dump that makes one usable, so neither may arrive by accident: a
// deployment that sets nothing gets neither. The local stack turns both on in
// compose.yml.
type GraphQL struct {
	PlaygroundEnabled    bool `mapstructure:"playground_enabled"`
	IntrospectionEnabled bool `mapstructure:"introspection_enabled"`
}

// Retention bounds the append-only outbox and inbox transport tables.
type Retention struct {
	Enabled bool
	// InitialDelay keeps cleanup off the startup critical path while ensuring
	// short-lived/restarting pods do not postpone it for a full cycle.
	InitialDelay time.Duration `mapstructure:"initial_delay"`
	// Interval defaults to twice daily. One replica wins an advisory lock per
	// pass; the others skip it.
	Interval time.Duration
	// BatchSize is how many rows one DELETE removes.
	BatchSize int32 `mapstructure:"batch_size" validate:"gt=0"`
	// OutboxEvents: outbox_events is a transport buffer that Debezium drains from
	// the WAL within seconds. 7 days is a replay/debug window, not a storage
	// guarantee.
	OutboxEvents time.Duration `mapstructure:"outbox_events"`
	// InboxEvents: inbox_events only has to remember a message id for as long as
	// the pipeline could still redeliver it. 7 days is far beyond any
	// RabbitMQ/Dapr redelivery window.
	InboxEvents time.Duration `mapstructure:"inbox_events"`
	// RetiredTokens bounds `token`, whose rows nothing else deletes: an SDK token
	// source mints one per refresh, so a single process at a 15-minute lifetime
	// leaves 120 rows a day behind on the table every request authenticates
	// against.
	//
	// 90 days rather than the transports' 7: a retired credential's row is the
	// audit evidence that it existed and when it stopped working, which outlives a
	// transport buffer's debugging window. Zero or less disables the sweep.
	RetiredTokens time.Duration `mapstructure:"retired_tokens"`
}

// Metered is whether this deployment's usage is counted, and by whom.
//
// The two organization fields answer a different question from Enabled, which is
// why both can be set at once and neither implies the other:
//
//   - Enabled means "I report my usage to api_url". A single-tenant fleet sets
//     this and nothing else -- it meters nobody, so it has no platform
//     organization to name.
//   - OrganizationExternalID means "this organization is the platform, do not
//     meter it". A deployment holding other people's tenants sets this and
//     nothing else -- it counts them locally and reports to no one.
//
// A deployment doing both sets all of them, which is supported rather than
// contradictory. Empty OrganizationExternalID resolves to uuid.Nil, read as
// "exempt nobody"; see ResolvePlatformOrgID.
type Metered struct {
	// Enabled turns the usage reporter on. Off is the ordinary case and a no-op:
	// nothing is reported and no credential is read.
	Enabled bool
	// OrganizationExternalID identifies the platform organization — the one that
	// sells Kaiten and against which every other organization is a customer.
	OrganizationExternalID string `mapstructure:"organization_external_id"`
	// OrganizationID overrides the derived UUID. Empty means "derive it", which
	// is what every deployment should do.
	OrganizationID string `mapstructure:"organization_id"`
	// APIURL names the Kaiten this deployment reports its usage to. Required
	// whenever reporting is on, and it must not be this deployment's own address
	// -- a Kaiten that meters itself meters its own tenants against its own
	// entitlements.
	APIURL string `mapstructure:"api_url" validate:"required_if=Enabled true"`
	// TokenFile is the path to a file containing the service token. The API
	// watches this file and hot-reloads the dogfooding reporter when the token
	// changes. Whatever provisions the reporting credential writes it here.
	//
	// A path, not the token, which is why it is not a secret: it discloses
	// nothing, so it is an ordinary setting and belongs in the config file with
	// the rest of them.
	TokenFile string `mapstructure:"token_file" validate:"required_if=Enabled true"`
}

// Usage tunes the usage report path.
type Usage struct {
	// RolloverMaxClosures caps how many usage windows a single report may
	// close. A report against a periodic entitlement first closes every
	// window elapsed since the last report, one PERIOD_ROLLED_OVER event
	// each, while it holds the pair's lock: an HOUR entitlement idle for a
	// year closes 8,760. Above the cap the report fails with a 500 rather than
	// hold the lock for as long as the walk takes. The default, 100,000, is an
	// HOUR entitlement idle for 11 years.
	RolloverMaxClosures int `mapstructure:"rollover_max_closures" validate:"gt=0"`
	// IdempotencyWindow is how long a report's transactionId is remembered:
	// a retry with the same key inside it replays the original answer, one
	// after it is applied again. 35 days by default, because reports are dated
	// on receipt and a buffered report replayed late must still be recognized
	// across a whole monthly period plus margin. At least 24 hours.
	IdempotencyWindow time.Duration `mapstructure:"idempotency_window" validate:"gte=24h"`
}

// Connectors settings storage.
type Connectors struct {
	VaultBasePath string `mapstructure:"vault_base_path"`
}

// settings is every setting: its dotted key, the variable that sets it, its
// default, and whether it holds a credential. One row per setting, and the only
// place any of the four is written.
//
// The variables are stated rather than derived. OTEL_* are the OpenTelemetry
// spec's own names and KAITEN_API_PORT predates server.port, so no prefix rule
// generates this column -- and BindEnv is what makes a deployment with no file at
// all work, because viper only consults the environment for keys it knows.
var settings = []struct {
	key    string
	envVar string
	deflt  any
	// secret marks a setting whose value is a credential. Its only consumer is
	// the chart guard: api.config is rendered into a ConfigMap, so these keys
	// must never appear there at all -- not even as a reference. charts/kaiten's
	// kaiten.apiSecretKeys is this list, and chart_test.go compares the two.
	secret bool
}{
	{"server.port", "KAITEN_API_PORT", nil, false},
	{"server.platform_port", PlatformPortEnvVar, 3001, false},
	{"database.connection_string", "KAITEN_DATABASE_CONNECTION_STRING", nil, true},
	{"logging.level", "LOG_LEVEL", "warn", false},
	{"logging.format", "LOG_FORMAT", "json", false},
	{"otel.enabled", "OTEL_ENABLED", false, false},
	{"otel.endpoint", "OTEL_EXPORTER_OTLP_ENDPOINT", "localhost:4318", false},
	{"otel.metrics_endpoint", "OTEL_METRICS_ENDPOINT", nil, false},
	{"otel.service_name", "OTEL_SERVICE_NAME", "kaiten-api", false},
	{"otel.insecure", "OTEL_INSECURE", false, false},
	{"otel.traces_sampling_ratio", "OTEL_TRACES_SAMPLING_RATIO", 1.0, false},
	{"otel.authorization", "OTEL_EXPORTER_OTLP_AUTHORIZATION", nil, true},
	{"graphql.playground_enabled", "KAITEN_GRAPHQL_PLAYGROUND_ENABLED", false, false},
	{"graphql.introspection_enabled", "KAITEN_GRAPHQL_INTROSPECTION_ENABLED", false, false},
	{"retention.enabled", "KAITEN_RETENTION_ENABLED", true, false},
	{"retention.initial_delay", "KAITEN_RETENTION_INITIAL_DELAY", "5m", false},
	{"retention.interval", "KAITEN_RETENTION_INTERVAL", "12h", false},
	{"retention.batch_size", "KAITEN_RETENTION_BATCH_SIZE", 1000, false},
	{"retention.outbox_events", "KAITEN_RETENTION_OUTBOX_EVENTS", "168h", false},
	{"retention.inbox_events", "KAITEN_RETENTION_INBOX_EVENTS", "168h", false},
	{"retention.retired_tokens", "KAITEN_RETENTION_RETIRED_TOKENS", "2160h", false},
	{"metered.enabled", "KAITEN_METERED_ENABLED", false, false},
	{"metered.organization_external_id", "KAITEN_METERED_ORGANIZATION_EXTERNAL_ID", nil, false},
	{"metered.organization_id", "KAITEN_METERED_ORGANIZATION_ID", nil, false},
	{"metered.api_url", "KAITEN_METERED_API_URL", nil, false},
	{"metered.token_file", "KAITEN_METERED_TOKEN_FILE", nil, false},
	{"connectors.vault_base_path", "VAULT_CONNECTORS_BASE_PATH", "kaiten/connectors", false},
	{"usage.rollover_max_closures", "KAITEN_USAGE_ROLLOVER_MAX_CLOSURES", 100000, false},
	{"usage.idempotency_window", "KAITEN_USAGE_IDEMPOTENCY_WINDOW", "840h", false},
}

const (
	// FileEnvVar names the configuration file outright; DirEnvVar names a
	// directory to look for config.{yaml,yml,toml,json} in.
	FileEnvVar = "KAITEN_CONFIG_FILE"
	DirEnvVar  = "KAITEN_CONFIG_DIR"

	// PlatformPortEnvVar is the variable Server.PlatformPort reads, named here
	// because the settings table and the chart both need to say it.
	PlatformPortEnvVar = "KAITEN_PLATFORM_API_PORT"
)

// decode is viper's own decode hook plus one: every string is trimmed on the way
// in.
//
// A trailing newline is the ordinary shape of a mounted Secret file, and a
// whitespace-only value is one somebody meant to set and did not. Trimmed before
// validation, so `required` refuses "   " and no consumer has to remember to.
//
// Passing a hook replaces viper's default, so its two are restated: without them
// a "12h" from a file stops becoming a Duration.
var decode = mapstructure.ComposeDecodeHookFunc(
	mapstructure.StringToTimeDurationHookFunc(),
	mapstructure.StringToSliceHookFunc(","),
	func(from, _ reflect.Type, data any) (any, error) {
		if from.Kind() != reflect.String {
			return data, nil
		}
		return strings.TrimSpace(data.(string)), nil
	},
)

// LoadConfig assembles the configuration this process runs on: defaults, then an
// optional configuration file, then the environment over the top, and only then a
// check that what came out is enough to start.
//
// No file is needed: discovery finding nothing is silence rather than an error.
// What is refused is a configuration short of something the process cannot run
// without, reported as the missing settings rather than as an absent file.
//
// The caller owns the result; nothing here is global.
func LoadConfig() (*Config, error) {
	_ = godotenv.Load(".env")

	if err := refuseRenamed(); err != nil {
		return nil, err
	}

	v := viper.New()
	for _, s := range settings {
		if s.deflt != nil {
			v.SetDefault(s.key, s.deflt)
		}
		if err := v.BindEnv(s.key, s.envVar); err != nil {
			return nil, err
		}
	}

	path, err := readConfigFile(v)
	if err != nil {
		return nil, err
	}

	var cfg Config
	// Exact, not Unmarshal: a key no field claims is a setting that silently
	// never applies, which is the whole reason `retention: intervall:` must fail
	// rather than leave the interval at its default and say nothing.
	if err := v.UnmarshalExact(&cfg, viper.DecodeHook(decode)); err != nil {
		return nil, fmt.Errorf("read configuration file %s: %w", path, err)
	}

	if err := validator.New(validator.WithRequiredStructEnabled()).Struct(&cfg); err != nil {
		return nil, explain(err)
	}

	return &cfg, nil
}

// renamed is every variable that used to set something and no longer does,
// paired with the one that replaced it.
//
// It exists because viper only consults the environment for keys it was told
// about (BindEnv, not AutomaticEnv), so a renamed variable is not rejected -- it
// is invisible. A deployment that kept one would start, report nothing and look
// healthy, with the first symptom a metering gap noticed weeks later.
//
// Rows are deleted when nobody could still be carrying the old variable, which
// for a released one means a major version.
var renamed = []struct{ was, now string }{
	{"KAITEN_DOGFOODING_ENABLED", "KAITEN_METERED_ENABLED"},
	{"KAITEN_DOGFOODING_ORGANIZATION_EXTERNAL_ID", "KAITEN_METERED_ORGANIZATION_EXTERNAL_ID"},
	{"KAITEN_DOGFOODING_ORGANIZATION_ID", "KAITEN_METERED_ORGANIZATION_ID"},
	{"KAITEN_DOGFOODING_API_URL", "KAITEN_METERED_API_URL"},
	{"KAITEN_DOGFOODING_TOKEN_FILE", "KAITEN_METERED_TOKEN_FILE"},
}

// refuseRenamed fails on any variable from the renamed table, naming all of them
// at once and what to write instead.
//
// Presence is the test, not value: KAITEN_DOGFOODING_ENABLED=false is still an
// operator who believes they have turned reporting off through a variable that
// nothing reads, and the next person to set it to true would get silence.
func refuseRenamed() error {
	var found []string
	for _, r := range renamed {
		if _, ok := os.LookupEnv(r.was); ok {
			found = append(found, fmt.Sprintf("%s is now %s", r.was, r.now))
		}
	}
	if len(found) == 0 {
		return nil
	}
	return fmt.Errorf("configuration uses variables that no longer set anything:\n\t%s\n"+
		"the `dogfooding:` config block is now `metered:`; nothing reads the old names, "+
		"so leaving them set is metering that silently does not happen",
		strings.Join(found, "\n\t"))
}

// readConfigFile loads an optional configuration file into v and returns the
// path it read, or "" if none was found: whatever KAITEN_CONFIG_FILE names, else
// the first config.{yaml,yml,toml,json,...} viper finds in KAITEN_CONFIG_DIR,
// else none. A file nobody named is optional; a file somebody named must exist.
//
// Discovery and parsing are both viper's own -- SetConfigName/AddConfigPath/
// ReadInConfig -- because nothing here needs to see the bytes before viper does.
// Secret-bearing settings are refused in the file entirely (see the chart's
// kaiten.apiSecretKeys), so there is no ${VARIABLE} expansion to intercept.
func readConfigFile(v *viper.Viper) (string, error) {
	if named := strings.TrimSpace(os.Getenv(FileEnvVar)); named != "" {
		v.SetConfigFile(named)
		if err := v.ReadInConfig(); err != nil {
			return "", fmt.Errorf("%s names %s: %w", FileEnvVar, named, err)
		}
		return named, nil
	}

	dir := strings.TrimSpace(os.Getenv(DirEnvVar))
	if dir == "" {
		dir = "."
	}
	v.SetConfigName("config")
	v.AddConfigPath(dir)
	if err := v.ReadInConfig(); err != nil {
		var notFound viper.ConfigFileNotFoundError
		if errors.As(err, &notFound) {
			return "", nil
		}
		return "", fmt.Errorf("read configuration file: %w", err)
	}
	return v.ConfigFileUsed(), nil
}

// explain rewrites a validation failure into the names an operator can act on.
//
// go-playground/validator reports Go field paths -- "Config.Server.PlatformPort"
// -- and an operator does not set Go fields. They set a key in a file or a
// variable in a Deployment, so that is what a refusal has to say. This is the one
// place the two vocabularies meet, and it reads the same table everything else
// does.
func explain(err error) error {
	var failures validator.ValidationErrors
	if !errors.As(err, &failures) {
		return err
	}

	paths := fieldPaths()
	lines := make([]string, 0, len(failures))
	for _, f := range failures {
		name := strings.TrimPrefix(f.Namespace(), "Config.")
		where, known := paths[name]
		if !known {
			lines = append(lines, fmt.Sprintf("%s (%s)", name, f.Tag()))
			continue
		}
		lines = append(lines, fmt.Sprintf("%s / %s: %s", where.key, where.envVar, reason(f)))
	}

	sort.Strings(lines)
	return fmt.Errorf("incomplete configuration:\n  %s", strings.Join(lines, "\n  "))
}

func reason(f validator.FieldError) string {
	switch f.Tag() {
	case "required", "required_if":
		return "required"
	case "oneof":
		return fmt.Sprintf("must be one of: %s", strings.ReplaceAll(f.Param(), " ", ", "))
	case "nefield":
		return fmt.Sprintf("must differ from %s", f.Param())
	case "gt", "gte":
		return fmt.Sprintf("must be > %s", f.Param())
	case "lte":
		return fmt.Sprintf("must be <= %s", f.Param())
	default:
		return f.Tag()
	}
}

// fieldPaths joins Config's shape to the settings table: Go field path -> the key
// and the variable that set it. Embedded fields keep their name on the Go side,
// because that is what validator's namespace says, and contribute nothing to the
// key, because that is what mapstructure's squash means.
func fieldPaths() map[string]struct{ key, envVar string } {
	byKey := make(map[string]string, len(settings))
	for _, s := range settings {
		byKey[s.key] = s.envVar
	}

	out := make(map[string]struct{ key, envVar string }, len(settings))
	var walk func(t reflect.Type, field, key string)
	walk = func(t reflect.Type, field, key string) {
		for i := range t.NumField() {
			f := t.Field(i)
			fieldPath := strings.TrimPrefix(field+"."+f.Name, ".")

			keyPath := key
			if !f.Anonymous {
				name := f.Tag.Get("mapstructure")
				if name == "" {
					name = strings.ToLower(f.Name)
				}
				keyPath = strings.TrimPrefix(key+"."+name, ".")
			}

			if f.Type.Kind() == reflect.Struct {
				walk(f.Type, fieldPath, keyPath)
				continue
			}
			out[fieldPath] = struct{ key, envVar string }{keyPath, byKey[keyPath]}
		}
	}
	walk(reflect.TypeOf(Config{}), "", "")
	return out
}

// ResolvePlatformOrgID returns the internal UUID of the platform organization,
// or uuid.Nil when this deployment has none.
func (m Metered) ResolvePlatformOrgID() (uuid.UUID, error) {
	if pinned := strings.TrimSpace(m.OrganizationID); pinned != "" {
		parsed, err := uuid.Parse(pinned)
		if err != nil {
			return uuid.Nil, fmt.Errorf("KAITEN_METERED_ORGANIZATION_ID %q is not a UUID: %w", pinned, err)
		}
		return parsed, nil
	}

	external := strings.TrimSpace(m.OrganizationExternalID)
	if external == "" {
		return uuid.Nil, nil
	}

	return externalid.DeriveOrganizationID(external), nil
}
