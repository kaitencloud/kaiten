package gettargetingcontext

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Reader is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Reader interface {
	TargetingContext(
		ctx context.Context, cl caller.OrganizationCaller,
	) ([]featureflag.TargetingContextNode, error)
}

type Request struct{}

type Response struct {
	Body TargetingContext
}

/*
TargetingContext is what a targeting rule may read, described well enough for an
editor to complete it and to say what each name means.

Roots is not the set of legal identifiers, and an editor must not treat it as
one. A host sends its own attributes in the evaluation context and targets on
them — `user.cohort`, `device.os` — which the linter deliberately allows. These
are the names the *server* guarantees; anything else is the caller's own and is
accepted without being suggested.
*/
type TargetingContext struct {
	Roots []featureflag.TargetingContextNode `json:"roots" nullable:"false" doc:"Identifiers the server guarantees, and what is reachable below each. Not a closed set: a host may target on its own attributes too"`
}

func RegisterEndpoint(api huma.API, app Reader) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "get-targeting-context",
		Method:      http.MethodGet,
		Path:        "/feature-flags/targeting/context",
		Summary:     "Get the targeting context schema",
		Description: "Returns the identifiers a targeting rule may read, with their types and descriptions, " +
			"including the organization's own entitlement slugs. Intended for an editor: it is what " +
			"autocomplete and hover documentation are built from. The set is not closed — a rule may " +
			"also target on attributes the caller supplies in its own evaluation context.",
		Tags:   []string{"featureflags"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, _ *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		roots, err := app.TargetingContext(ctx, cl)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: TargetingContext{Roots: roots},
		}, nil
	})
}
