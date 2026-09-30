package attio

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/attio/attioclient"
)

// SyncPolicy decides what an update does when the Kaiten record has no Attio
// counterpart yet.
type SyncPolicy string

const (
	// SyncPolicyCreateAndBind creates the missing counterpart and links it. The
	// default, and what an operator almost always wants: an update for a record
	// created before the connector was switched on should bring it into Attio
	// rather than fail forever.
	SyncPolicyCreateAndBind SyncPolicy = "create-and-bind"

	// SyncPolicyFailAndRetry refuses to create anything on an update path, and asks
	// for redelivery instead. For a deployment that treats Attio as the system of
	// record and wants a missing counterpart to be somebody's problem, not a
	// silently created record.
	SyncPolicyFailAndRetry SyncPolicy = "fail-and-retry"
)

// ErrNotConfigured means the organization activated the connector but its settings
// are missing or unusable.
//
// Terminal, not transient: no redelivery fixes a missing API key, and retrying would
// turn one misconfigured organization into an endless redelivery loop for every event
// it produces.
var ErrNotConfigured = errors.New("attio: connector settings are not configured for this organization")

// RuntimeSettings is what one organization's settings resolve to for one event.
//
// It carries no URL: the only one the settings may hold is attioclient.BaseURL, and
// the consumer sends every request there whatever they hold.
type RuntimeSettings struct {
	APIKey        string
	SyncPolicy    SyncPolicy
	FieldsMapping map[string]string
}

// SettingsReader reads an organization's stored connector settings, unredacted.
//
// Unredacted is why this is a port onto the store rather than a call to the settings
// use case: GetConnectorSettings redacts every writeOnly field, which is correct for
// the wire and useless here -- the connector needs the actual API key. That is not a
// gap in the API, it is the API being right; the connector is inside the process that
// owns the secret, so it reads the store directly.
type SettingsReader interface {
	Get(ctx context.Context, organizationID uuid.UUID, connectorName string) (map[string]any, error)
}

// resolveSettings turns the stored payload into what one sync needs.
func resolveSettings(payload map[string]any) (RuntimeSettings, error) {
	apiKey := stringValue(payload, "attioApiKey")
	if apiKey == "" {
		return RuntimeSettings{}, fmt.Errorf("%w: attioApiKey is empty", ErrNotConfigured)
	}

	apiURL := stringValue(payload, "attioApiUrl")
	if apiURL == "" {
		return RuntimeSettings{}, fmt.Errorf("%w: attioApiUrl is empty", ErrNotConfigured)
	}
	// The schema refuses any other URL on the way in. Settings stored before it did
	// are refused here, rather than synced to Attio regardless of what they say: an
	// operator reading "not configured" fixes them, one reading a sync that works
	// never learns they point somewhere else.
	if strings.TrimSuffix(apiURL, "/") != attioclient.BaseURL {
		return RuntimeSettings{}, fmt.Errorf("%w: attioApiUrl must be %s", ErrNotConfigured, attioclient.BaseURL)
	}

	return RuntimeSettings{
		APIKey:        apiKey,
		SyncPolicy:    parseSyncPolicy(stringValue(payload, "syncPolicy")),
		FieldsMapping: fieldsMapping(payload),
	}, nil
}

// parseSyncPolicy defaults anything it does not recognise to create-and-bind.
//
// Defaulting rather than refusing, because the alternative is that a typo in one
// optional field stops a connector that would otherwise work -- and the two policies
// differ in what happens on a path most organizations never hit.
func parseSyncPolicy(value string) SyncPolicy {
	if strings.EqualFold(strings.TrimSpace(value), string(SyncPolicyFailAndRetry)) {
		return SyncPolicyFailAndRetry
	}

	return SyncPolicyCreateAndBind
}

func stringValue(payload map[string]any, key string) string {
	value, ok := payload[key].(string)
	if !ok {
		return ""
	}

	return strings.TrimSpace(value)
}

// fieldsMapping reads the source-field -> Attio-attribute map, skipping entries that
// are not strings rather than failing.
//
// An empty map is legitimate and means "sync the built-in fields only", so there is
// nothing here to refuse: a mapping the schema already validated cannot be malformed,
// and being tolerant costs nothing for a payload that is.
func fieldsMapping(payload map[string]any) map[string]string {
	raw, ok := payload["fieldsMapping"].(map[string]any)
	if !ok {
		return map[string]string{}
	}

	mapping := make(map[string]string, len(raw))
	for key, value := range raw {
		if text, ok := value.(string); ok {
			mapping[key] = text
		}
	}

	return mapping
}
