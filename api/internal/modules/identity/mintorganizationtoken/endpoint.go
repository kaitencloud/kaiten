package mintorganizationtoken

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Minter is the one facade method this operation calls, declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Minter interface {
	MintOrganizationToken(ctx context.Context, cl caller.PlatformCaller,
		target uuid.UUID, cmd *Command) (*schema.PlainToken, error)
}

// Request declares orgId because huma requires every path placeholder to have a
// declaring field. This endpoint now reads it, and passes it to the facade as the
// target; the handler beneath still takes the target from targetorg, which is what
// the facade fills after checking the organization exists. So there are still two
// readings of one string and still only one of them is used -- the validated one.
// What changed is where the validation happens: in the application rather than in
// a middleware, so a driver that is not HTTP gets it too.
type Request struct {
	OrganizationID uuid.UUID                 `path:"orgId" format:"uuid" doc:"Organization to mint the credential inside"`
	Body           MintOrganizationTokenBody `doc:"Credential details"`
}

// MintOrganizationTokenBody is what a client sends, as opposed to the
// schema.PlainToken response: the id, the slug, the owning membership, the audit
// fields and the revocation fields are all server-side. create-service-account-token
// reuses schema.PlainToken itself for this same split (readOnly server-assigned
// fields); this operation stays on its own type instead, for the reason
// below. It is also distinct from Command, which is the use case's input
// for every driver; see Command for why the two are not one type.
//
// It names no organization: the target is the {orgId} in the path, already
// resolved and existence-checked by the Platform API's target-organization
// middleware. A body field would be a second, contradictable spelling of the same
// thing. It names no service account either -- the owner is always system:kaiten,
// which is what makes this a platform operation rather than a tenant one, and it
// is resolved inside the INSERT from its own membership in the target.
type MintOrganizationTokenBody struct {
	Name string `json:"name" minLength:"1" maxLength:"255" doc:"Human-readable label for the credential" example:"ci-deploy"`
	// Scopes narrow, never widen. Omitted means "inherit the calling platform
	// credential's scopes", which is the common case for a bootstrap; anything
	// listed must be a subset of them.
	Scopes []string `json:"scopes,omitempty" doc:"Requested scopes, which must be a subset of the calling platform credential's. Omitted inherits all of them." example:"read:customers"`
	// TTL is a Go duration string rather than the absolute expiresAt
	// createtokenonserviceaccount takes: the caller here is a machine that knows
	// how long it wants the credential for, and having the server own the clock
	// removes a skew a bootstrap job cannot correct for. The response reports the
	// instant the server derived.
	TTL string `json:"ttl,omitempty" doc:"Lifetime as a Go duration (\"15m\", \"24h\"). Omitted mints a non-expiring credential, whose bound is revocation -- including the cascade from the platform credential that minted it." example:"15m"`
}

// Response is schema.PlainToken, the same component
// POST /api/service-accounts/{slug}/tokens returns. See UseCase.Execute for why
// this operation publishes no credential model of its own.
type Response struct {
	Body *schema.PlainToken `doc:"The minted credential, including its secret value (shown only once)"`
}

func RegisterEndpoint(api huma.API, app Minter) {
	kaitenhuma.RegisterPlatformForOrganization(api, huma.Operation{
		OperationID: "mint-organization-token",
		Method:      http.MethodPost,
		Path:        "/platform/organizations/{orgId}/tokens",
		Summary:     "Mint an organization credential for the platform identity",
		Description: "Issues an ordinary organization-scoped access token (`ksh_...`) owned by the " +
			"system:kaiten platform identity inside the named organization, derived from its " +
			"existing membership there. Requested scopes must be a subset of the calling platform " +
			"credential's; omitting them inherits all of them. TTL is optional -- omitted mints a " +
			"non-expiring credential. The token value is returned once, here, and can never be " +
			"retrieved again. Revoking the platform credential that minted it also revokes this one.",
		Tags:          []string{"platform"},
		DefaultStatus: http.StatusCreated,
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusNotFound,
			http.StatusConflict,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
		},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Platform(ctx)
		if err != nil {
			return nil, err
		}

		minted, err := app.MintOrganizationToken(ctx, cl, request.OrganizationID, &Command{
			Name:   request.Body.Name,
			Scopes: request.Body.Scopes,
			TTL:    request.Body.TTL,
			// Written out rather than left to the zero value: this is the field the
			// wire does not publish, and a reader of the endpoint should be able to see
			// what it sends for it without inferring. See Command.Replace for why a
			// name conflict must stay a 409 here.
			Replace: false,
		})
		if err != nil {
			return nil, err
		}

		return &Response{Body: minted}, nil
	})
}

// RegisterWebhook publishes the SYSTEM_ORGANIZATION_TOKEN_ISSUED contract on the
// CORE document, even though the operation that emits it lives on the Platform
// one.
//
// The two halves of this event have different audiences. The operation is called
// by the platform, so it belongs to the Platform contract. The event is delivered
// to whoever subscribes for the organization in its organization_id -- the tenant
// whose authority just grew -- and tenants read the Core document. Publishing it
// only in the Platform document would hide it from the one audience that actually
// receives it, and would leave a Core-document reader unable to recognise a
// delivery they are already getting.
//
// This is not a loophole in the Core/Platform partition: that partition is about
// which credential may CALL an operation (see kaitenhuma.RegisterPlatform), and
// webhook declarations are not operations -- the webhook package registers no
// route and authenticates nothing. internal/webhookcontract asserts both
// directions of this on the Core document and asserts that the Platform document
// declares no webhooks at all, so the choice is pinned rather than incidental.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.SystemOrganizationTokenIssued,
		Data:        (*schema.SystemTokenIssuance)(nil),
		OperationID: "onSystemOrganizationTokenIssued",
		Summary:     "System Organization Token Issued Webhook",
		Description: "Triggered when a platform credential mints an organization-scoped " +
			"credential for the `system:kaiten` platform identity inside this organization. " +
			"Carries the platform credential that performed the mint and the scopes granted, " +
			"never the credential value. Expect this at the rate an integration refreshes: " +
			"roughly 120 per day per process at a 15-minute lifetime.",
		Tags: []string{"webhooks", "identity"},
	})
}
