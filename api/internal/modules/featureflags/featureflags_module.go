package featureflags

import (
	"fmt"
	"log/slog"
	"reflect"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	customertargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/customers/targetingfacts"
	deploymentzonetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/createfeatureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/deletefeatureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/getfeatureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/getfeatureflags"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/gettargetingcontext"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/linttargetingrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/manifest/getmanifest"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep/bulkevaluateflags"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep/evaluateflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/testtargetingrule"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/updatefeatureflag"
	instancetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/instances/targetingfacts"
)

const (
	evaluationPublisherBufferSize = 5000
	evaluationPublisherWorkers    = 2
)

type UseCases struct {
	CreateFeatureFlag   *createfeatureflag.UseCase
	DeleteFeatureFlag   *deletefeatureflag.UseCase
	GetFeatureFlag      *getfeatureflag.UseCase
	GetFeatureFlags     *getfeatureflags.UseCase
	UpdateFeatureFlag   *updatefeatureflag.UseCase
	EvaluateFlag        *evaluateflag.UseCase
	BulkEvaluateFlags   *bulkevaluateflags.UseCase
	GetManifest         *getmanifest.UseCase
	GetTargetingContext *gettargetingcontext.UseCase
	LintTargetingRule   *linttargetingrule.UseCase
	TestTargetingRule   *testtargetingrule.UseCase
}

func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Pool)
	pub := newEvaluationPublisher(
		outbox.NewOutboxRepository(outboxdb.New(svc.Pool)),
		evaluationPublisherBufferSize,
	)

	// The publisher is always constructed -- every evaluation use case holds one,
	// and Publish is non-blocking by design -- but its drain goroutines only run
	// where background work belongs, so a docs generator or a seeder does not spawn
	// workers it has no way to stop. Unstarted, Publish still cannot block: it
	// buffers, then drops with a warning.
	if svc.BackgroundWorkers {
		pub.start(evaluationPublisherWorkers)
		svc.WorkerRegistry.OnStop(pub.stop)
	}

	// Which organization is kaiten itself, so the OFREP endpoints can tell a
	// platform-internal evaluation from a customer's — derived from the
	// external id, never read from a request (Config.Metered.ResolvePlatformOrgID).
	// It returns uuid.Nil when no dogfooding organization is configured at
	// all, and then no caller is internal: everything is metered and audited.
	platformOrgID, err := svc.Config.Metered.ResolvePlatformOrgID()
	if err != nil {
		slog.Warn("featureflags: no platform organization configured, every flag evaluation is metered and audited", "error", err)
	}

	entitlementCatalogue := catalogue.New(svc.Pool)
	customerFacts := customertargetingfacts.New(svc.Pool)
	instanceFacts := instancetargetingfacts.New(svc.Pool)
	deploymentZoneFacts := deploymentzonetargetingfacts.New(svc.Pool)

	return &UseCases{
		CreateFeatureFlag: createfeatureflag.NewUseCase(createfeatureflag.Deps{
			UserProvider:         svc.UserProvider,
			UsageReporter:        svc.UsageReporter,
			Uof:                  svc.Uof,
			EntitlementCatalogue: entitlementCatalogue,
		}),
		DeleteFeatureFlag: deletefeatureflag.NewUseCase(deletefeatureflag.Deps{
			UserProvider:  svc.UserProvider,
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
		}),
		GetFeatureFlag: getfeatureflag.NewUseCase(getfeatureflag.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		GetFeatureFlags: getfeatureflags.NewUseCase(getfeatureflags.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		UpdateFeatureFlag: updatefeatureflag.NewUseCase(updatefeatureflag.Deps{
			UserProvider:         svc.UserProvider,
			Uof:                  svc.Uof,
			UsageReporter:        svc.UsageReporter,
			EntitlementCatalogue: entitlementCatalogue,
		}),
		EvaluateFlag: evaluateflag.NewUseCase(evaluateflag.Deps{
			UserProvider:        svc.UserProvider,
			Queries:             queries,
			UsageReporter:       svc.UsageReporter,
			PlatformOrgID:       platformOrgID,
			CustomerFacts:       customerFacts,
			InstanceFacts:       instanceFacts,
			DeploymentZoneFacts: deploymentZoneFacts,
		}, pub),
		BulkEvaluateFlags: bulkevaluateflags.NewUseCase(bulkevaluateflags.Deps{
			UserProvider:        svc.UserProvider,
			Queries:             queries,
			UsageReporter:       svc.UsageReporter,
			PlatformOrgID:       platformOrgID,
			CustomerFacts:       customerFacts,
			InstanceFacts:       instanceFacts,
			DeploymentZoneFacts: deploymentZoneFacts,
		}, pub),
		GetManifest: getmanifest.NewUseCase(getmanifest.Deps{
			UserProvider: svc.UserProvider,
			Queries:      queries,
		}),
		// The two operations that support authoring a targeting rule rather
		// than serving one. Both read the same entitlement catalogue the write
		// path lints against, which is what makes the editor's verdict and the
		// save's verdict the same verdict.
		GetTargetingContext: gettargetingcontext.NewUseCase(gettargetingcontext.Deps{
			UserProvider:         svc.UserProvider,
			EntitlementCatalogue: entitlementCatalogue,
		}),
		LintTargetingRule: linttargetingrule.NewUseCase(linttargetingrule.Deps{
			UserProvider:         svc.UserProvider,
			EntitlementCatalogue: entitlementCatalogue,
		}),
		// The rehearsal enriches from the same three fact ports the OFREP
		// evaluations use, so what an author sees in a dry run is what a
		// client's evaluation will read.
		TestTargetingRule: testtargetingrule.NewUseCase(testtargetingrule.Deps{
			UserProvider:         svc.UserProvider,
			EntitlementCatalogue: entitlementCatalogue,
			CustomerFacts:        customerFacts,
			InstanceFacts:        instanceFacts,
			DeploymentZoneFacts:  deploymentZoneFacts,
		}),
	}
}

func RegisterFeatureFlagSchemas(api huma.API) {
	openapi := api.OpenAPI()
	schemasMap := openapi.Components.Schemas.Map()

	// Define the targeting types
	basicType := reflect.TypeOf((*schema.BasicTargeting)(nil)).Elem()
	rolloutDateType := reflect.TypeOf((*schema.RolloutDateTargeting)(nil)).Elem()
	rolloutPercentageType := reflect.TypeOf((*schema.RolloutPercentageTargeting)(nil)).Elem()
	targetingsType := reflect.TypeOf(schema.Targetings{})

	// Get the names from the types
	basicName := basicType.Name()
	rolloutDateName := rolloutDateType.Name()
	rolloutPercentageName := rolloutPercentageType.Name()
	targetingsName := targetingsType.Name()

	// Register all the individual targeting types
	openapi.Components.Schemas.Schema(basicType, true, basicName)
	openapi.Components.Schemas.Schema(rolloutDateType, true, rolloutDateName)
	openapi.Components.Schemas.Schema(rolloutPercentageType, true, rolloutPercentageName)

	// Get or create the Targetings schema
	baseSchema := openapi.Components.Schemas.Schema(targetingsType, true, targetingsName)

	// Ensure Items is initialized
	if baseSchema.Items == nil {
		baseSchema.Items = &huma.Schema{}
	}

	// Set the AnyOf with proper references using dynamic names
	baseSchema.Items.AnyOf = []*huma.Schema{
		{Ref: fmt.Sprintf("#/components/schemas/%s", basicName)},
		{Ref: fmt.Sprintf("#/components/schemas/%s", rolloutDateName)},
		{Ref: fmt.Sprintf("#/components/schemas/%s", rolloutPercentageName)},
	}

	baseSchema.Type = "array"
	baseSchema.Description = "Polymorphic list of targeting rules (Basic, RolloutDate, RolloutPercentage)"
	schemasMap[targetingsName] = baseSchema

	defaultVariantType := reflect.TypeOf((*schema.DefaultVariant)(nil)).Elem()
	defaultVariantName := defaultVariantType.Name()

	// Build 3 strict wrapper schemas with simplified names for SDK discriminators
	schemasMap["Basic"] = &huma.Schema{
		Type:                 "object",
		AdditionalProperties: false,
		Properties: map[string]*huma.Schema{
			"type":  {Type: "string", Enum: []any{string(schema.BasicType)}},
			"value": {Type: "string"},
		},
		Required: []string{"type", "value"},
	}

	schemasMap["RolloutDate"] = &huma.Schema{
		Type:                 "object",
		AdditionalProperties: false,
		Properties: map[string]*huma.Schema{
			"type":  {Type: "string", Enum: []any{string(schema.RolloutDateType)}},
			"start": openapi.Components.Schemas.Schema(reflect.TypeOf(schema.RolloutStep{}), true, "RolloutStep"),
			"end":   openapi.Components.Schemas.Schema(reflect.TypeOf(schema.RolloutStep{}), true, "RolloutStep"),
		},
		Required: []string{"type", "start", "end"},
	}

	schemasMap["RolloutPercentage"] = &huma.Schema{
		Type:                 "object",
		AdditionalProperties: false,
		Properties: map[string]*huma.Schema{
			"type":         {Type: "string", Enum: []any{string(schema.RolloutPercentageType)}},
			"distribution": openapi.Components.Schemas.Schema(reflect.TypeOf(map[string]int64{}), true, "RolloutPercentageDistribution"),
		},
		Required: []string{"type", "distribution"},
	}

	// DefaultVariant is the union of those 3 wrapper shapes.
	schemasMap[defaultVariantName] = &huma.Schema{
		OneOf: []*huma.Schema{
			{Ref: "#/components/schemas/Basic"},
			{Ref: "#/components/schemas/RolloutDate"},
			{Ref: "#/components/schemas/RolloutPercentage"},
		},
		Discriminator: &huma.Discriminator{
			PropertyName: "type",
			Mapping: map[string]string{
				string(schema.BasicType):             "#/components/schemas/Basic",
				string(schema.RolloutDateType):       "#/components/schemas/RolloutDate",
				string(schema.RolloutPercentageType): "#/components/schemas/RolloutPercentage",
			},
		},
	}

	// Now point the schema carrying these two members at the shapes built
	// above. Huma cannot do it on its own: Targetings is a slice, which never
	// gets a $ref, and DefaultVariant is a hand-built union. create-feature-flag
	// and update-feature-flag both reuse schema.FeatureFlag directly (
	// reversed -- see openapi_contract_test.go), so patching this one
	// registered type covers the request and response side of both.
	refPolymorphicMembers(openapi, reflect.TypeOf(schema.FeatureFlag{}), targetingsName, defaultVariantName)
}

// refPolymorphicMembers replaces the inline targetings and default_variant
// schemas huma generated for t with references to the named components.
func refPolymorphicMembers(openapi *huma.OpenAPI, t reflect.Type, targetingsName, defaultVariantName string) {
	s := openapi.Components.Schemas.Schema(t, false, t.Name())
	if s.Properties == nil {
		return
	}

	for property, name := range map[string]string{
		"targetings":      targetingsName,
		"default_variant": defaultVariantName,
	} {
		if prop, exists := s.Properties[property]; exists {
			*prop = huma.Schema{Ref: fmt.Sprintf("#/components/schemas/%s", name)}
		}
	}
}
