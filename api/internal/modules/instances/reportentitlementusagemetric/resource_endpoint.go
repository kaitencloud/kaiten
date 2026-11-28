package reportentitlementusagemetric

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// ResourceRequest is Request for one resource of an entitlement that counts per
// resource (limitScope RESOURCE): the same body, the same header and the same
// answer, addressed one level down. It is a type of its own, rather than an
// embedding of Request, because the key's documentation differs: here it is
// scoped to the resource too.
type ResourceRequest struct {
	InstanceSlug    string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	EntitlementSlug string `path:"entitlementSlug" doc:"Slug of an entitlement whose limitScope is RESOURCE" example:"sources-per-competitor"`
	// ResourceKey carries no schema pattern or length, so that a malformed key
	// answers the documented ReportEntitlementUsageMetric.InvalidResourceKey and
	// not Huma's generic 422, as Idempotency-Key does.
	ResourceKey string `path:"resourceKey" doc:"The vendor's own identifier for the object this usage counts for: 1 to 128 characters of [A-Za-z0-9._:-], matched exactly and case-sensitively (Stigg and stigg are two resources), and neither . nor .. . The resource needs no declaring: its first accepted report creates its counter. It must contain no personal data: anyone who can read the instance can read it, as with a report's metadata. Percent-escapes in the segment are decoded once (comp%3A123 is comp:123). A key that does not match answers 422 ReportEntitlementUsageMetric.InvalidResourceKey." example:"stigg"`
	// idempotencyKeySent is whether the header was sent at all, which
	// IdempotencyKey alone cannot say: Huma binds absent and empty alike.
	idempotencyKeySent bool
	IdempotencyKey     string `header:"Idempotency-Key" doc:"Optional idempotency key: the id of the business event this report counts, 1 to 128 characters of [A-Za-z0-9._:-], matched exactly and case-sensitively. A report sent again with the same key and the same behavior and value within KAITEN_USAGE_IDEMPOTENCY_WINDOW (35 days by default) is applied once: the retry answers 200 with the original response and the Idempotent-Replayed header, and changes nothing. The same key with another behavior or value answers 409 ReportEntitlementUsageMetric.TransactionIdReused. A rejected report does not consume its key. Scoped to the instance, the entitlement and the resource: one business event may feed two resources under one key, as it may feed two entitlements. Stored and read back as transactionId." example:"source-created:9f2c"`
	Body               ReportEntitlementUsageBody
}

// Resolve records whether Idempotency-Key was sent, empty or not.
func (r *ResourceRequest) Resolve(ctx huma.Context) []error {
	ctx.EachHeader(func(name, _ string) {
		if strings.EqualFold(name, "Idempotency-Key") {
			r.idempotencyKeySent = true
		}
	})
	return nil
}

// RegisterResourceEndpoint registers the report of one resource's usage. It is the
// entitlement's report, one level down: it runs the same use case, behind the same
// facade method and the same scope, and the use case reads the pair's limit scope
// to answer each route for the entitlements it is meant for.
func RegisterResourceEndpoint(api huma.API, app Reporter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "reportEntitlementResourceUsageMetric",
		Method:      "POST",
		Path:        "/instances/{instanceSlug}/entitlements/{entitlementSlug}/resources/{resourceKey}/usage",
		Summary:     "Report usage for one resource of an entitlement",
		Description: "Report a usage metric for one resource of an entitlement whose limitScope is RESOURCE: one counter per resource of the instance, each measured against the entitlement's limit. Same body, headers and answers as reportEntitlementUsageMetric, with the counter, the limit gate and the usage window those of the resource: the answer's value is the resource's counter and its resourceKey names it. A resource needs no declaring; its first accepted report creates its counter, and a refused one creates nothing. A report that would open a resource past the ceiling of resources an entitlement may count on an instance (KAITEN_USAGE_MAX_RESOURCES, 10000 by default) answers 422 ReportEntitlementUsageMetric.ResourceLimitReached. An entitlement whose limitScope is INSTANCE answers 422 ReportEntitlementUsageMetric.ResourceKeyNotAllowed. Only numeric values are accepted here: an AI credit pool counts per instance. Add and remove with append and 1 and -1; set writes the absolute count, which corrects a drift.",
		Tags:        []string{"instances"},
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusNotFound,
			http.StatusUnprocessableEntity,
			http.StatusConflict,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
	}, RequiredScope, func(ctx context.Context, request *ResourceRequest) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		resourceKey := usage.DecodeResourceKey(request.ResourceKey)
		if !usage.ValidResourceKey(resourceKey) {
			return nil, apierrors.UnprocessableEntityWithErrors(
				"ReportEntitlementUsageMetric.InvalidResourceKey",
				"resourceKey must be 1 to 128 characters of letters, digits, '.', '_', ':' and '-', and neither '.' nor '..'",
				&apierrors.ErrorDetail{Message: "the key's format", Location: resourceKeyLocation, Value: resourceKey},
			)
		}
		if request.Body.Value.AI != nil {
			return nil, apierrors.UnprocessableEntityWithErrors(
				"ReportEntitlementUsageMetric.InvalidValueType",
				"a resource's usage is reported as a number: ai_usage is for an AI credit pool, which counts per instance",
				&apierrors.ErrorDetail{Message: "send a number value", Location: "body.value.type"},
			)
		}

		return report(ctx, app, cl, reportInput{
			instanceSlug:       request.InstanceSlug,
			entitlementSlug:    request.EntitlementSlug,
			resourceKey:        &resourceKey,
			idempotencyKey:     request.IdempotencyKey,
			idempotencyKeySent: request.idempotencyKeySent,
			body:               request.Body,
		})
	})
}
