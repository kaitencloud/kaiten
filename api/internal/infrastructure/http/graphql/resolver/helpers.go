// Package resolver implements the GraphQL resolvers. The *.resolvers.go files
// are gqlgen's; this file holds every hand-written function in the package.
//
// That split is a rule, not an accident. gqlgen's round-trip is additive only:
// when a field disappears from a .graphqls, its resolver is not deleted but
// moved to the bottom of the file under a "!!! WARNING !!!" banner, where it
// keeps compiling and serving nothing. The same relocation happens to any
// helper left in a resolvers file. So:
//
//   - hand-written code goes in helpers.go, never in a *.resolvers.go;
//   - after removing a field from the schema, grep the resolvers files for that
//     banner and delete what it flags — `task generate:gqlgen` will not.
package resolver

import (
	"math"
	"time"

	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
)

func customerIntegrationsToMap(integrations map[string]customerschema.CustomerIntegration) map[string]any {
	result := make(map[string]any, len(integrations))
	for adapter, integration := range integrations {
		result[adapter] = integrationEntryToMap(
			integration.ExternalID,
			integration.Metadata,
			integration.WebURL,
			integration.SyncedAt,
			integration.LastError,
		)
	}

	return result
}

func instanceIntegrationsToMap(integrations map[string]instanceschema.InstanceIntegration) map[string]any {
	result := make(map[string]any, len(integrations))
	for adapter, integration := range integrations {
		result[adapter] = integrationEntryToMap(
			integration.ExternalID,
			integration.Metadata,
			integration.WebURL,
			integration.SyncedAt,
			integration.LastError,
		)
	}

	return result
}

// integrationEntryToMap mirrors the REST integration shape so GraphQL
// consumers read the same keys (external_id, metadata, web_url, synced_at,
// last_error) through the schemaless `Map` scalar.
func integrationEntryToMap(externalID string, metadata map[string]any, webURL *string, syncedAt time.Time, lastError *string) map[string]any {
	if metadata == nil {
		metadata = map[string]any{}
	}

	entry := map[string]any{
		"external_id": externalID,
		"metadata":    metadata,
		"synced_at":   syncedAt.UTC().Format(time.RFC3339),
	}
	if webURL != nil {
		entry["web_url"] = *webURL
	}
	if lastError != nil {
		entry["last_error"] = *lastError
	}

	return entry
}

// pageLimit narrows a GraphQL nullable Int page size to the int32 the query
// layer takes. GraphQL Int is an untrusted client value unmarshalled into a
// Go int, so on a 64-bit build a large enough `limit:` would wrap to a small
// or negative int32 -- a request for a huge page silently becoming a request
// for a tiny one. Clamping keeps the failure mode monotonic; the query layer
// still applies its own default and maximum.
func pageLimit(limit *int) int32 {
	if limit == nil {
		return 0
	}
	switch {
	case *limit > math.MaxInt32:
		return math.MaxInt32
	case *limit < math.MinInt32:
		return math.MinInt32
	default:
		return int32(*limit)
	}
}
