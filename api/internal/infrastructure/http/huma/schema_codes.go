package huma

import (
	"fmt"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/validation"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// schemaCodesKey is the operation metadata SchemaCodes fills.
const schemaCodesKey = "kaiten.schemaCodes"

// SchemaCodes is operation metadata naming the domain code that answers when
// a field breaks a bound its schema publishes: a required reason, a maximum
// length, an enum. The bound stays in the contract, where clients and SDKs
// read it, and the refusal still carries the Appendix A code instead of
// Huma's generic 422 without one.
//
// Keys are request locations as Huma reports them: "body.reason",
// "query.status".
func SchemaCodes(codes map[string]string) map[string]any {
	return map[string]any{schemaCodesKey: codes}
}

// schemaCode is the domain code an operation declares for one of Huma's
// validation details, if any. A missing required property is reported at its
// parent's location, the property named in the message.
func schemaCode(ctx huma.Context, detail *huma.ErrorDetail) (string, bool) {
	if ctx == nil || ctx.Operation() == nil {
		return "", false
	}
	codes, _ := ctx.Operation().Metadata[schemaCodesKey].(map[string]string)
	if code, ok := codes[detail.Location]; ok {
		return code, true
	}
	for location, code := range codes {
		parent, property, found := strings.Cut(location, ".")
		if !found || strings.Contains(property, ".") {
			continue
		}
		if detail.Location == parent && detail.Message == fmt.Sprintf(validation.MsgExpectedRequiredProperty, property) {
			return code, true
		}
	}
	return "", false
}

// withSchemaCode turns Huma's validation failure into the domain code of the
// first detail an operation declares one for, keeping every detail.
func withSchemaCode(ctx huma.Context, model *kaitenerrors.Problem, instance string) huma.StatusError {
	for _, detail := range model.Errors {
		code, ok := schemaCode(ctx, &huma.ErrorDetail{Message: detail.Message, Location: detail.Location, Value: detail.Value})
		if !ok {
			continue
		}
		return kaitenerrors.ProblemFrom(kaitenerrors.UnprocessableEntityWithErrors(code, model.Detail, model.Errors...), instance)
	}
	return model
}
