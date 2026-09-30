package bulkevaluateflags

import (
	"reflect"

	"github.com/danielgtaylor/huma/v2"
	"github.com/gofiber/fiber/v3"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
)

// registerOpenAPI registers Huma/OpenAPI schemas and path
// We have to do this because OFREP does not follow Huma problem+json error format
// and Huma doesn't allow to override it per endpoint
func registerOpenAPI(api huma.API) {
	openapi := api.OpenAPI()

	// Register all schemas
	schemas := []any{
		ofrep.BulkEvaluationRequest{},
		ofrep.BulkEvaluationSuccess{},
		ofrep.BulkEvaluationFailure{},
		ofrep.EvaluationSuccess{},
		ofrep.EvaluationFailure{},
	}
	for _, s := range schemas {
		openapi.Components.Schemas.Schema(reflect.TypeOf(s), true, "")
	}

	// Get the base schema for reference, but don't modify it
	baseSuccessSchema := openapi.Components.Schemas.Schema(reflect.TypeOf(ofrep.BulkEvaluationSuccess{}), true, "")

	// Create a NEW custom schema with the oneOf for flags
	customBulkSuccessSchema := &huma.Schema{
		Type:       baseSuccessSchema.Type,
		Properties: make(map[string]*huma.Schema),
	}

	// Copy properties from the base schema
	for k, v := range baseSuccessSchema.Properties {
		if k != "flags" {
			customBulkSuccessSchema.Properties[k] = v
		}
	}

	// Add the custom flags property with oneOf
	customBulkSuccessSchema.Properties["flags"] = &huma.Schema{
		Type: "array",
		Items: &huma.Schema{
			OneOf: []*huma.Schema{
				openapi.Components.Schemas.Schema(reflect.TypeOf(ofrep.EvaluationSuccess{}), true, ""),
				openapi.Components.Schemas.Schema(reflect.TypeOf(ofrep.EvaluationFailure{}), true, ""),
			},
		},
		Description: "Array of evaluation results",
	}

	openapi.Paths["/ofrep/v1/evaluate/flags"] = &huma.PathItem{
		Post: &huma.Operation{
			OperationID: "evaluateFlagsBulk",
			Summary:     "OFREP bulk flag evaluation contract",
			Description: "OFREP bulk evaluation request.\nThe endpoint is called by the client providers to evaluate all flags at once.",
			Tags:        []string{"OFREP Core"},
			Security:    []map[string][]string{kaitenhuma.ScopeRequirement(RequiredScope)},
			Parameters: []*huma.Param{
				{
					Name:        "If-None-Match",
					In:          "header",
					Required:    false,
					Description: "The request will be processed only if ETag doesn't match any of the values listed.",
					Schema:      openapi.Components.Schemas.Schema(reflect.TypeOf(""), true, ""),
				},
			},
			RequestBody: &huma.RequestBody{
				Description: "EvaluateVariant multiple flags in one request",
				Content: map[string]*huma.MediaType{
					fiber.MIMEApplicationJSON: {
						Schema: openapi.Components.Schemas.Schema(reflect.TypeOf(ofrep.BulkEvaluationRequest{}), true, ""),
					},
				},
				Required: false,
			},
			Responses: map[string]*huma.Response{
				"200": {
					Description: "OFREP successful evaluation response",
					Headers: map[string]*huma.Header{
						"ETag": {
							Description: "Entity tag used for cache validation",
							Schema:      openapi.Components.Schemas.Schema(reflect.TypeOf(""), true, ""),
						},
					},
					Content: map[string]*huma.MediaType{
						fiber.MIMEApplicationJSON: {
							Schema: &huma.Schema{
								OneOf: []*huma.Schema{
									customBulkSuccessSchema,
									openapi.Components.Schemas.Schema(reflect.TypeOf(ofrep.BulkEvaluationFailure{}), true, ""),
								},
							},
						},
					},
				},
				"304": {
					Description: "Bulk evaluation is not modified",
				},
				"400": {
					Description: "Bad evaluation request",
					Content: map[string]*huma.MediaType{
						fiber.MIMEApplicationJSON: {
							Schema: openapi.Components.Schemas.Schema(reflect.TypeOf(ofrep.BulkEvaluationFailure{}), true, ""),
						},
					},
				},
				"401": {
					Description: "Unauthorized - You need credentials to access the API",
				},
				"403": {
					Description: "Forbidden - You are not authorized to access the API",
				},
				"429": {
					Description: "Rate limit reached on the Flag Management System",
					Headers: map[string]*huma.Header{
						"Retry-After": {
							Description: "Indicates when to retry the request again",
							Schema:      openapi.Components.Schemas.Schema(reflect.TypeOf(""), true, ""),
						},
					},
				},
				"500": {
					Description: "Internal server error",
					Content: map[string]*huma.MediaType{
						fiber.MIMEApplicationJSON: {
							Schema: openapi.Components.Schemas.Schema(reflect.TypeOf(ofrep.BulkEvaluationFailure{}), true, ""),
						},
					},
				},
			},
		},
	}
}
