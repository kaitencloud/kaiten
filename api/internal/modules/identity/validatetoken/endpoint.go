package validatetoken

import (
	"strings"

	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
)

// RegisterEndpoint registers the Fiber route for token validation at
// /api/tokens/validate AND under it, any suffix, both answered by the same
// handler, which ignores the suffix. The route is public by necessity -- the
// endpoint Envoy's ext_authz calls cannot itself sit behind ext_authz.
//
// Why the suffix: neither raw Envoy's ext_authz HttpService nor Envoy Gateway's
// SecurityPolicy.extAuth.http.path can point a check at a fixed path. Both only
// have path_prefix semantics, which PREPEND to the original request's path, so a
// ksh_ request for /api/customers is checked at
// /api/tokens/validate/api/customers. Rewriting that back to the constant took an
// EnvoyPatchPolicy addressing the ext_authz filter by its INDEX in the shared
// listener's filter list, one per SecurityPolicy, and that index moves every time
// a policy on the listener is added, removed or renamed. Only the KbK's kaiten
// filter was ever pinned: on 2026-10-17 every other ksh_ check -- the fleets'
// kaiten APIs and every saas-api route, the KbK's included -- arrived suffixed
// and was refused, which is how ksh_ tokens stopped working on app and demo.
//
// Answering under the prefix makes the check path irrelevant, with no proxy
// patch at all. It widens nothing that matters: the handler reads only the
// Authorization header and answers the same 200 + identity JWT, or the same 401,
// whatever the suffix, and no other route may be registered under the prefix
// (server_boundary_test holds the public listener to that).
//
// The route answers ANY method. Envoy forwards the check with the original
// request's method, so a GET-only route answers 405 on every write made with a
// ksh_ token, and ext_authz turns that into a denial. The handler reads only
// the Authorization header, so the verb carries no meaning here.
func RegisterEndpoint(router fiber.Router, handler UseCase) {
	validate := validateTokenHandler(handler)
	router.All("/tokens/validate", validate)
	router.All("/tokens/validate/*", validate)
}

// Failures render as RFC 9457 problem bodies through fiberapi.Problem, like
// every other route on both routers.
func validateTokenHandler(handler UseCase) fiber.Handler {
	return func(c fiber.Ctx) error {
		token, err := extractToken(c)
		if err != nil {
			return fiberapi.Problem(c, err)
		}

		// Validate token
		validationResp, err := handler.ValidateToken(c.Context(), token)
		if err != nil {
			return fiberapi.Problem(c, apierrors.Wrap(err, apierrors.KindInternal,
				"ValidateToken.Failed", "internal server error"))
		}

		if !validationResp.Valid {
			return fiberapi.Problem(c, apierrors.Unauthorized(
				"ValidateToken.Invalid", validationResp.Error,
			))
		}

		// Hand the minted identity JWT back in the Authorization header and
		// answer 200 — NOT 204. Envoy's ext_authz HTTP client allows a request
		// through only on an exact 200; every other status, 2xx included, is
		// classified as a DENIAL and the check response is returned verbatim to
		// the caller. A 204 here therefore turned every `ksh_`-authenticated
		// request into a bare, bodyless 204 that looked like a successful call
		// with an empty result (see cluster.api.ext_authz.denied in Envoy's
		// stats).
		c.Set("Authorization", "Bearer "+validationResp.JWTToken)
		return c.SendStatus(fiber.StatusOK)
	}
}

func extractToken(c fiber.Ctx) (string, error) {
	authHeader := c.Get("Authorization")
	if authHeader != "" {
		const bearerPrefix = "Bearer "
		if rest, ok := strings.CutPrefix(authHeader, bearerPrefix); ok {
			token := strings.TrimSpace(rest)
			if token != "" {
				return token, nil
			}
		}
	}

	return "", apierrors.Unauthorized("ValidateToken.MissingAuthorizationHeader",
		"missing valid Authorization header")
}
