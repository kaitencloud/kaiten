package bulkevaluateflags

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
)

// Evaluator is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
//
// It returns an error where the use case cannot: a failed evaluation is an error
// variant per flag in the body, but a refused one never reaches the use case at all.
type Evaluator interface {
	EvaluateAll(
		ctx context.Context, cl caller.OrganizationCaller, evaluationContext ofrep.Context,
	) ([]FlagEvaluation, error)
}

type BulkRequest struct {
	Context ofrep.Context `json:"context,omitempty" doc:"Evaluation context for all flags"`
}

// RegisterEndpoint registers the Fiber route and manually documents it in Huma.
//
// The route carries no authorization middleware, and there is none to carry:
// RequiredScope is enforced by the facade method this handler calls, which is the
// one enforcement point every driver passes through. What the route does instead is
// what a huma registrar does for the other 100 operations -- it resolves the caller
// and turns whatever the facade returns into a problem+json response, via
// fiberapi.Problem. tests/architecture/entry_point_scope_test.go lists this path as
// facade-enforced and checks the package still declares the const, so the route
// cannot quietly become unauthorized by having nothing at all.
//
// caller.Organization runs before the body is bound, so a request with no identity
// is still refused without being parsed. A request with an identity but the wrong
// scope is refused after binding, because the facade needs the command to be
// refused -- so an under-scoped caller sending an unparseable body is answered 400
// rather than 403. That is the same ordering every huma operation now has (422
// before 403) and the same reasoning: the status a caller gets for a request that
// is wrong twice is not worth a second enforcement point.
func RegisterEndpoint(api huma.API, router fiber.Router, app Evaluator) {
	router.Post("/ofrep/v1/evaluate/flags",
		func(c fiber.Ctx) error {
			cl, err := caller.Organization(c.Context())
			if err != nil {
				return fiberapi.Problem(c, err)
			}

			req := &BulkRequest{}

			if err := c.Bind().Body(req); err != nil {
				return c.Status(http.StatusBadRequest).JSON(fiber.Map{
					"error":   "INVALID_BODY",
					"message": err.Error(),
				})
			}

			evaluationsResult, err := app.EvaluateAll(c.Context(), cl, req.Context)
			if err != nil {
				return fiberapi.Problem(c, err)
			}

			flags := make([]any, len(evaluationsResult))
			for i, eval := range evaluationsResult {
				if eval.Detail.Reason != nil && *eval.Detail.Reason == openfeature.ReasonError {
					flags[i] = ofrep.EvaluationFailure{
						Key:          eval.Key,
						ErrorCode:    string(*eval.Detail.ErrorCode),
						ErrorDetails: *eval.Detail.ErrorMessage,
						Metadata:     ofrep.Metadata(eval.Detail.FlagMetadata),
					}
				} else {
					flags[i] = ofrep.EvaluationSuccess{
						Key:      eval.Key,
						Value:    eval.Detail.Value,
						Variant:  *eval.Detail.Variant,
						Reason:   string(*eval.Detail.Reason),
						Metadata: ofrep.Metadata(eval.Detail.FlagMetadata),
					}
				}
			}

			response := ofrep.BulkEvaluationSuccess{
				Flags: flags,
			}

			return c.Status(http.StatusOK).JSON(response)
		})

	registerOpenAPI(api)
}
