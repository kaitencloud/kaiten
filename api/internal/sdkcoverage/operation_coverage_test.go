package sdkcoverage_test

import (
	"context"
	"reflect"
	"sort"
	"testing"

	"github.com/goccy/go-yaml"
	"github.com/kaitencloud/sdk-go"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/server"
)

// TestSDKCoversEveryOpenAPIOperation is an operation-coverage check, and only
// that: it asserts every SDK-facing operationId in the spec is mapped to a
// method name that exists on the public SDK, and that no mapping points at an
// operation the spec no longer declares.
/*
consoleAuthoringOperations are Core operations the public SDK deliberately
does not model, each with the reason it has no SDK audience.

They exist to support a person in the console's rule editor — fetching the
autocomplete schema, linting on every keystroke, rehearsing a draft — where
a machine client managing flags through the SDK writes a rule it already
knows and lets the write path validate it. Wrapping them would grow the
public surface (and its compatibility burden) for callers that do not exist.

Adding an entry here is a product decision that an operation is
console-internal, and it should read like one in the diff. The coverage test
keeps the list honest in both directions: an entry whose operation left the
contract is dead weight to delete, and an entry that gained an SDK mapping
after all is a contradiction to resolve.
*/
var consoleAuthoringOperations = map[string]string{
	// The notification feed, its read state and its preference matrix. Every
	// one of them addresses the signed-in person's own rows -- an unread count
	// and a set of choices about what to be told -- and a machine client holding
	// an API token has neither. There is nothing here for the SDK to model that
	// is not "pretend to be a particular human".
	"listNotifications":          "a person's own feed; an API token has no unread state",
	"markNotificationsRead":      "a person's own read state",
	"getNotificationPreferences": "a person's own notification choices",
	"putNotificationPreferences": "a person's own notification choices",
	"get-targeting-context":      "the editor's autocomplete schema; SDK callers author rules from their own knowledge",
	"lint-targeting-rule":        "per-keystroke feedback for the editor; SDK callers get the same verdict from the write path",
	"test-targeting-rule":        "interactive dry-run for the editor; nothing programmatic rehearses a rule it is about to submit",
}

func TestSDKCoversEveryOpenAPIOperation(t *testing.T) {
	client, err := sdk.NewClient("https://example.com/api")
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	implemented := map[string]sdkMethodRef{
		"list-components":                    {receiver: client.Components, method: "List"},
		"create-component":                   {receiver: client.Components, method: "Create"},
		"delete-component":                   {receiver: client.Components, method: "Delete"},
		"get-component":                      {receiver: client.Components, method: "Get"},
		"update-component":                   {receiver: client.Components, method: "Update"},
		"list-customers":                     {receiver: client.Customers, method: "List"},
		"create-customer":                    {receiver: client.Customers, method: "Create"},
		"delete-customer":                    {receiver: client.Customers, method: "Delete"},
		"get-customer":                       {receiver: client.Customers, method: "Get"},
		"update-customer":                    {receiver: client.Customers, method: "Update"},
		"list-deployment-zones":              {receiver: client.DeploymentZones, method: "List"},
		"create-deployment-zone":             {receiver: client.DeploymentZones, method: "Create"},
		"delete-deployment-zone":             {receiver: client.DeploymentZones, method: "Delete"},
		"get-deployment-zone-by-slug":        {receiver: client.DeploymentZones, method: "Get"},
		"update-deploymentZone":              {receiver: client.DeploymentZones, method: "Update"},
		"list-entitlement-groups":            {receiver: client.EntitlementGroups, method: "List"},
		"create-entitlement-group":           {receiver: client.EntitlementGroups, method: "Create"},
		"delete-entitlement-group":           {receiver: client.EntitlementGroups, method: "Delete"},
		"get-entitlement-group":              {receiver: client.EntitlementGroups, method: "Get"},
		"update-entitlement-group":           {receiver: client.EntitlementGroups, method: "Update"},
		"add-entitlement-to-group":           {receiver: client.EntitlementGroups, method: "AddEntitlement"},
		"remove-entitlement-from-group":      {receiver: client.EntitlementGroups, method: "RemoveEntitlement"},
		"get-entitlement-group-usage":        {receiver: client.EntitlementGroups, method: "GetUsage"},
		"list-entitlements":                  {receiver: client.Entitlements, method: "List"},
		"create-entitlement":                 {receiver: client.Entitlements, method: "Create"},
		"delete-entitlement":                 {receiver: client.Entitlements, method: "Delete"},
		"get-entitlement":                    {receiver: client.Entitlements, method: "Get"},
		"update-entitlement":                 {receiver: client.Entitlements, method: "Update"},
		"get-feature-flags":                  {receiver: client.FeatureFlags, method: "List"},
		"create-feature-flag":                {receiver: client.FeatureFlags, method: "Create"},
		"delete-feature-flag":                {receiver: client.FeatureFlags, method: "Delete"},
		"get-feature-flag":                   {receiver: client.FeatureFlags, method: "Get"},
		"update-feature-flag":                {receiver: client.FeatureFlags, method: "Update"},
		"getInstances":                       {receiver: client.Instances, method: "List"},
		"createInstance":                     {receiver: client.Instances, method: "Create"},
		"deleteInstance":                     {receiver: client.Instances, method: "Delete"},
		"getInstance":                        {receiver: client.Instances, method: "Get"},
		"patchInstance":                      {receiver: client.Instances, method: "UpdateStatus"},
		"updateInstance":                     {receiver: client.Instances, method: "Update"},
		"getAuditTrails":                     {receiver: client.Instances, method: "ListAuditTrails"},
		"getEntitlementsUsageMetrics":        {receiver: client.Instances, method: "ListEntitlementUsageMetrics"},
		"getEntitlementUsageMetrics":         {receiver: client.Instances, method: "GetEntitlementUsageMetric"},
		"reportEntitlementUsageMetric":       {receiver: client.Instances, method: "ReportEntitlementUsageMetric"},
		"get-licenses":                       {receiver: client.Licenses, method: "List"},
		"create-license":                     {receiver: client.Licenses, method: "Create"},
		"delete-license":                     {receiver: client.Licenses, method: "Delete"},
		"get-license":                        {receiver: client.Licenses, method: "Get"},
		"update-license":                     {receiver: client.Licenses, method: "Update"},
		"publish-license":                    {receiver: client.Licenses, method: "Publish"},
		"archive-license":                    {receiver: client.Licenses, method: "Archive"},
		"unarchive-license":                  {receiver: client.Licenses, method: "Unarchive"},
		"list-license-families":              {receiver: client.LicenseFamilies, method: "List"},
		"get-license-family":                 {receiver: client.LicenseFamilies, method: "Get"},
		"get-license-entitlements":           {receiver: client.Licenses, method: "ListEntitlements"},
		"associate-entitlement-with-license": {receiver: client.Licenses, method: "AssociateEntitlement"},
		"delete-license-entitlement":         {receiver: client.Licenses, method: "DeleteEntitlement"},
		"get-license-entitlement":            {receiver: client.Licenses, method: "GetEntitlement"},
		"update-license-entitlement":         {receiver: client.Licenses, method: "UpdateEntitlement"},
		"list-metadata-fields":               {receiver: client.MetadataFields, method: "List"},
		"create-metadata-field":              {receiver: client.MetadataFields, method: "Create"},
		"reorder-metadata-fields":            {receiver: client.MetadataFields, method: "Reorder"},
		"update-metadata-field":              {receiver: client.MetadataFields, method: "Update"},
		"archive-metadata-field":             {receiver: client.MetadataFields, method: "Archive"},
		"unarchive-metadata-field":           {receiver: client.MetadataFields, method: "Unarchive"},
		"dry-run-metadata-field":             {receiver: client.MetadataFields, method: "DryRun"},
		// get-organization, delete-organization, delete-membership and
		// delete-user are deliberately absent: they moved to the Platform API,
		// which this test does not cover. loadOpenAPIOperationIDs reads
		// srv.API() -- the Core document -- so the input set stays Core-only and
		// the Platform surface is not silently expected in the public SDK.
		"list-releases":                {receiver: client.Releases, method: "List"},
		"create-release":               {receiver: client.Releases, method: "Create"},
		"delete-release":               {receiver: client.Releases, method: "Delete"},
		"get-release-by-slug":          {receiver: client.Releases, method: "Get"},
		"get-service-accounts":         {receiver: client.ServiceAccounts, method: "List"},
		"create-service-account":       {receiver: client.ServiceAccounts, method: "Create"},
		"get-service-account":          {receiver: client.ServiceAccounts, method: "Get"},
		"update-service-account":       {receiver: client.ServiceAccounts, method: "Update"},
		"get-service-account-tokens":   {receiver: client.ServiceAccounts, method: "ListTokens"},
		"create-service-account-token": {receiver: client.ServiceAccounts, method: "CreateToken"},
		"delete-service-account-token": {receiver: client.ServiceAccounts, method: "DeleteToken"},
	}

	currentOperations := loadOpenAPIOperationIDs(t)

	var missingMappings []string
	for operationID := range currentOperations {
		if _, exempt := consoleAuthoringOperations[operationID]; exempt {
			continue
		}
		if _, ok := implemented[operationID]; !ok {
			missingMappings = append(missingMappings, operationID)
		}
	}

	if len(missingMappings) > 0 {
		sort.Strings(missingMappings)
		t.Fatalf("OpenAPI operations missing public SDK mapping: %v", missingMappings)
	}

	var staleMappings []string
	for operationID, target := range implemented {
		if _, ok := currentOperations[operationID]; !ok {
			staleMappings = append(staleMappings, operationID)
		}

		receiverType := reflect.TypeOf(target.receiver)
		if _, ok := receiverType.MethodByName(target.method); !ok {
			t.Fatalf("public SDK receiver %s is missing method %s for operation %s", receiverType, target.method, operationID)
		}
	}

	if len(staleMappings) > 0 {
		sort.Strings(staleMappings)
		t.Fatalf("public SDK mappings refer to operations no longer present in the OpenAPI spec: %v", staleMappings)
	}

	// The exemptions stay honest the same two ways the mappings do: an entry
	// must still name a real operation, and it cannot also be mapped — an
	// operation is in the SDK or deliberately out of it, never both.
	for operationID := range consoleAuthoringOperations {
		if _, ok := currentOperations[operationID]; !ok {
			t.Fatalf("console-authoring exemption %q names an operation no longer in the OpenAPI spec — delete the entry", operationID)
		}
		if _, ok := implemented[operationID]; ok {
			t.Fatalf("operation %q is both SDK-mapped and console-authoring-exempt — pick one", operationID)
		}
	}
}

type sdkMethodRef struct {
	receiver any
	method   string
}

type openAPIDocument struct {
	Paths map[string]map[string]openAPIOperation `yaml:"paths"`
}

type openAPIOperation struct {
	OperationID string `yaml:"operationId"`
}

func loadOpenAPIOperationIDs(t *testing.T) map[string]struct{} {
	t.Helper()

	srv, err := server.New(context.Background(), server.Dependencies{
		Auth:         nil,
		UserProvider: nil,
		DB:           nil,
	}, config.Config{})
	if err != nil {
		t.Fatalf("server.New() error = %v", err)
	}

	// 3.1, the only dialect this repo emits — same bytes `task generate:oas`
	// writes to app/openapi.yaml and the release workflow publishes.
	spec, err := srv.API().OpenAPI().YAML()
	if err != nil {
		t.Fatalf("YAML() error = %v", err)
	}

	var doc openAPIDocument
	if err := yaml.Unmarshal(spec, &doc); err != nil {
		t.Fatalf("yaml.Unmarshal() error = %v", err)
	}

	operationIDs := make(map[string]struct{})
	for path, methods := range doc.Paths {
		if shouldSkipSDKPath(path) {
			continue
		}

		for _, operation := range methods {
			if operation.OperationID == "" {
				continue
			}
			operationIDs[operation.OperationID] = struct{}{}
		}
	}

	return operationIDs
}

func shouldSkipSDKPath(path string) bool {
	switch path {
	case "/ofrep/v1/evaluate/flags", "/ofrep/v1/evaluate/flags/{key}", "/openfeature/v0/manifest":
		return true
	// Connector machinery: consumed by connector workers and by Kaiten's own
	// console (registration, activation, settings, per-entity integration
	// write-back), not by the public SDK.
	//
	// Activation and state are on this list for the same reason the settings paths
	// are: they are how an operator wires a connector up in the console, not
	// something a customer's integration against Kaiten's API does. A tenant
	// automating its own connector setup would be the argument for publishing them,
	// and nobody has made it yet.
	case "/connectors",
		"/connectors/{connectorName}",
		"/connectors/{connectorName}/activation",
		"/connectors/{connectorName}/state",
		"/connectors/{connectorName}/settings",
		"/connectors/{connectorName}/settings/schema",
		"/customers/{customerSlug}/integrations/{integrationName}",
		"/instances/{instanceSlug}/integrations/{integrationName}",
		"/integration/{adapter}/customer/{externalId}",
		"/integration/{adapter}/instance/{externalId}":
		return true
	}

	return false
}
