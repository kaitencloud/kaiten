package huma

import (
	"maps"
	"net/http"
	"strconv"

	"github.com/danielgtaylor/huma/v2"
)

const (
	// alsoRespondsKey is the operation metadata AlsoResponds fills.
	alsoRespondsKey = "kaiten.alsoResponds"
	// retryAfterOnConflictKey is the operation metadata BoundaryPending fills.
	retryAfterOnConflictKey = "kaiten.retryAfterOnConflict"
)

// Metadata merges operation metadata parts (SchemaCodes, AlsoResponds,
// BoundaryPending) into one huma.Operation.Metadata.
func Metadata(parts ...map[string]any) map[string]any {
	out := map[string]any{}
	for _, part := range parts {
		maps.Copy(out, part)
	}
	return out
}

// AlsoResponds is operation metadata for a second success status, with the
// same body as the default one: Huma documents only DefaultStatus, and a
// handler that sets Status otherwise answers something its contract omits.
func AlsoResponds(status int, description string) map[string]any {
	return map[string]any{alsoRespondsKey: map[int]string{status: description}}
}

// BoundaryPending is operation metadata for a use case that answers 409
// <UseCase>.BoundaryPending, which always carries Retry-After (Appendix A).
func BoundaryPending() map[string]any {
	return map[string]any{retryAfterOnConflictKey: true}
}

// ConfigureResponses documents what the error factory and the handlers add
// to responses: Retry-After on every 429 and 503, and on the 409 of a use
// case that can answer BoundaryPending; and each second success status an
// operation declares.
func ConfigureResponses(config huma.Config) huma.Config {
	config.OnAddOperation = append(config.OnAddOperation, documentResponses)
	return config
}

func documentResponses(_ *huma.OpenAPI, op *huma.Operation) {
	retryAfter := func(status int, description string) {
		response := op.Responses[strconv.Itoa(status)]
		if response == nil {
			return
		}
		if response.Headers == nil {
			response.Headers = map[string]*huma.Param{}
		}
		response.Headers["Retry-After"] = &huma.Param{
			Description: description,
			Schema:      &huma.Schema{Type: huma.TypeInteger, Minimum: new(float64)},
		}
	}
	retryAfter(http.StatusTooManyRequests, "Seconds to wait before the next attempt")
	retryAfter(http.StatusServiceUnavailable, "Seconds to wait before retrying, when a dependency (a payment provider) could not be reached")
	if on, _ := op.Metadata[retryAfterOnConflictKey].(bool); on {
		retryAfter(http.StatusConflict, "On .BoundaryPending: seconds until the period's close is expected to have run")
	}

	also, _ := op.Metadata[alsoRespondsKey].(map[int]string)
	defaultStatus := op.DefaultStatus
	if defaultStatus == 0 {
		defaultStatus = http.StatusOK
	}
	base := op.Responses[strconv.Itoa(defaultStatus)]
	for status, description := range also {
		if base == nil || op.Responses[strconv.Itoa(status)] != nil {
			continue
		}
		op.Responses[strconv.Itoa(status)] = &huma.Response{Description: description, Content: base.Content}
	}
}
