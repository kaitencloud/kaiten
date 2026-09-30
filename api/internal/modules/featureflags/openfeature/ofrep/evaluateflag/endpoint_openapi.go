package evaluateflag

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
	schemas := []any{ofrep.EvaluationSuccess{}, ofrep.EvaluationFailure{}, EvaluationRequest{}}
	for _, s := range schemas {
		openapi.Components.Schemas.Schema(reflect.TypeOf(s), true, "")
	}

	openapi.Paths["/ofrep/v1/evaluate/flags/{key}"] = &huma.PathItem{
		Post: &huma.Operation{
			OperationID: "evaluateFlag",
			Summary:     "OFREP single flag evaluation contract",
			Description: "EvaluateVariant a single feature flag for a given key",
			Tags:        []string{"OFREP Core"},
			Security:    []map[string][]string{kaitenhuma.ScopeRequirement(RequiredScope)},
			Parameters: []*huma.Param{
				{
					Name:     "key",
					In:       "path",
					Required: true,
					Schema:   openapi.Components.Schemas.Schema(reflect.TypeOf(""), true, ""),
				},
			},
			RequestBody: &huma.RequestBody{
				Description: "Evaluation context",
				Content: map[string]*huma.MediaType{
					fiber.MIMEApplicationJSON: {
						Schema: openapi.Components.Schemas.Schema(reflect.TypeOf(EvaluationRequest{}), true, ""),
					},
				},
				Required: true,
			},
			Responses: map[string]*huma.Response{
				"200": {
					Description: "Flag evaluated successfully",
					Content: map[string]*huma.MediaType{
						fiber.MIMEApplicationJSON: {
							Schema: openapi.Components.Schemas.Schema(reflect.TypeOf(ofrep.EvaluationSuccess{}), true, ""),
						},
					},
				},
				"400": {
					Description: "Evaluation failed",
					Content: map[string]*huma.MediaType{
						fiber.MIMEApplicationJSON: {
							Schema: openapi.Components.Schemas.Schema(reflect.TypeOf(ofrep.EvaluationFailure{}), true, ""),
						},
					},
				},
				"500": {
					Description: "Internal error",
					Content: map[string]*huma.MediaType{
						fiber.MIMEApplicationJSON: {
							Schema: openapi.Components.Schemas.Schema(reflect.TypeOf(ofrep.EvaluationFailure{}), true, ""),
						},
					},
				},
			},
		},
	}
}
