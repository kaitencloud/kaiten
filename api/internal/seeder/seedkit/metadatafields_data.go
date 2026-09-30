package seedkit

import metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"

// MetadataFieldsDeploymentZone declares the typed metadata fields available on
// every deployment zone. Each json_schema is a JSON Schema 2020-12 fragment the
// shared validator composes into a per-resource schema.
var MetadataFieldsDeploymentZone = []MetadataFieldDef{
	{
		Key:          "region",
		Label:        "Region",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
		DisplayOrder: 0,
		JSONSchema: map[string]any{
			"type":        "string",
			"description": "Cloud region identifier for the deployment zone",
			"examples":    []string{"eu-west-1"},
		},
	},
	{
		Key:          "cluster",
		Label:        "Cluster",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
		DisplayOrder: 1,
		JSONSchema: map[string]any{
			"type":        "string",
			"description": "Logical cluster name running this deployment zone",
		},
	},
	{
		Key:          "tier",
		Label:        "Tier",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
		DisplayOrder: 2,
		JSONSchema: map[string]any{
			"type": "string",
			"enum": []string{"production", "staging", "development"},
		},
	},
	{
		Key:          "featureToggles",
		Label:        "Feature toggles",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
		DisplayOrder: 3,
		JSONSchema: map[string]any{
			"type": "array",
			"items": map[string]any{
				"type": "string",
				"enum": []string{"etl", "sso", "monitoring", "webhooks", "analytics", "preview-data", "local-debug"},
			},
			"uniqueItems": true,
		},
	},
}

// MetadataFieldsInstance declares the typed metadata fields available on every
// instance (a curated subset of the snake_case keys written by the seeders).
var MetadataFieldsInstance = []MetadataFieldDef{
	{
		Key:          "environment",
		Label:        "Environment",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeINSTANCE,
		DisplayOrder: 0,
		JSONSchema: map[string]any{
			"type": "string",
			"enum": []string{"production", "staging", "sandbox", "development"},
		},
	},
	{
		Key:          "service_tier",
		Label:        "Service tier",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeINSTANCE,
		DisplayOrder: 1,
		JSONSchema: map[string]any{
			"type": "string",
			"enum": []string{"community", "starter", "dev", "pro", "enterprise"},
		},
	},
	{
		Key:          "workload",
		Label:        "Workload",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeINSTANCE,
		DisplayOrder: 2,
		JSONSchema: map[string]any{
			"type":        "string",
			"description": "Free-form workload qualifier matching the instance profile suffix",
		},
	},
	{
		Key:          "labels",
		Label:        "Labels",
		ResourceType: metadatafieldsdb.MetadataFieldResourceTypeINSTANCE,
		DisplayOrder: 3,
		JSONSchema: map[string]any{
			"type": "array",
			"items": map[string]any{
				"type": "string",
				"enum": []string{
					"production", "staging", "sandbox", "development",
					"community", "starter", "dev", "pro", "enterprise",
					"eu-west-1", "us-east-1", "eu-central-1", "us-west-1", "eu-west-2", "us-west-2",
				},
			},
			"uniqueItems": true,
		},
	},
}
