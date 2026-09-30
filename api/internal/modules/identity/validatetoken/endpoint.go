package validatetoken

import (
	"strings"

	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
)

// RegisterEndpoint registers the Fiber route for token validation at exactly
// one path, no wildcard suffix. The route is public by necessity -- the
// endpoint Envoy's ext_authz calls cannot itself sit behind ext_authz -- so the
// surface it opens is one path rather than a prefix, and anything else under
// /api/tokens/validate/ is a plain 404.
//
// Keeping it to one path takes work on the proxy side: neither raw Envoy's
// ext_authz HttpService nor Envoy Gateway's SecurityPolicy.extAuth.http.path
// can point a check at a fixed path, only path_prefix/path semantics that
// PREPEND to the original request's path. Both proxies are configured to
// rewrite the check path to this constant first -- compose through the
// token_validate_internal listener, Kubernetes through an EnvoyPatchPolicy in
// charts/kaiten/templates/ingress/ext-authz-path-patch.yaml.
//
// The route answers ANY method. Envoy forwards the check with the original
// request's method, so a GET-only route answers 405 on every write made with a
// ksh_ token, and ext_authz turns that into a denial. The handler reads only
// the Authorization header, so the verb carries no meaning here.
func RegisterEndpoint(router fiber.Router, handler UseCase) {
	router.All("/tokens/validate", validateTokenHandler(handler))
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
