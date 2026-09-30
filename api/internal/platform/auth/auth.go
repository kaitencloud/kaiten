// Package auth turns the internal JWT a request arrives with into a
// principal.Principal.
//
// There are two middlewares here and they are deliberately not one. JWTMiddleware
// authenticates the Core API and understands ORGANIZATION credentials only;
// PlatformMiddleware (platform.go) authenticates the Platform API and understands
// PLATFORM credentials only. Each is installed on its own Fiber app, listening on
// its own port -- see internal/infrastructure/http/server.
//
// The split is the boundary. A single middleware had to read a claim off an
// unverified parse to decide which verification path to run, which meant the
// public listener's authentication pipeline contained the code that mints platform
// principals: one mistake in that branch away from a platform credential working
// on a tenant route. Now the Core pipeline has no platform branch and no signing
// key to verify one with, so the question "could a platform token authenticate
// here?" is answered by the type, not by a code path.
package auth

import (
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type Middleware interface {
	Authorization() fiber.Handler
}

// JWTMiddleware extracts identity from a JWT already validated by the required
// reverse proxy. The API must not be exposed directly.
//
// It authenticates the CORE API and nothing else. It holds no platform signing
// key, reads no credential-kind claim, and has no path that can produce a
// principal of kind platform: a platform JWT presented here is simply a JWT with
// no kaiten_external_org_id, and is refused like any other malformed credential.
type JWTMiddleware struct{}

// New builds the Core API's authentication middleware.
//
// It deliberately takes no arguments. It used to take the platform signing key,
// and that parameter was the whole exposure: a Core listener holding the key is a
// Core listener one branch away from verifying a platform token. The key now goes
// to NewPlatform, which is installed on the Platform listener only.
func New() *JWTMiddleware {
	return &JWTMiddleware{}
}

func (j *JWTMiddleware) Authorization() fiber.Handler {
	return func(ctx fiber.Ctx) error {
		tokenString, err := extractBearerToken(ctx)
		if err != nil {
			return err
		}

		claims, err := parseJWTClaims(tokenString)
		if err != nil {
			return err
		}

		i, err := organizationIdentityFromClaims(claims, tokenString)
		if err != nil {
			return err
		}

		defaultCtx := principal.ContextWithPrincipal(ctx.Context(), i)
		ctx.SetContext(defaultCtx)
		return ctx.Next()
	}
}

func extractBearerToken(ctx fiber.Ctx) (string, error) {
	authHeader := ctx.Get("Authorization")
	if authHeader == "" {
		return "", kaitenerrors.Unauthorized("Auth.MissingAuthorizationHeader", "Missing Authorization header")
	}

	const bearerPrefix = "Bearer "
	if len(authHeader) < len(bearerPrefix) || authHeader[:len(bearerPrefix)] != bearerPrefix {
		return "", kaitenerrors.Unauthorized("Auth.UnknownAuthorizationHeader", "Invalid Authorization header format")
	}

	return authHeader[len(bearerPrefix):], nil
}

func parseJWTClaims(tokenString string) (jwt.MapClaims, error) {
	token, _, err := jwt.NewParser().ParseUnverified(tokenString, jwt.MapClaims{})
	if err != nil {
		return nil, kaitenerrors.Unauthorized("Auth.InvalidToken", "Failed to parse JWT")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, kaitenerrors.Unauthorized("Auth.InvalidClaims", "Invalid JWT claims")
	}

	return claims, nil
}

// organizationIdentityFromClaims turns a set of claims into an organization
// principal, which is the only kind this middleware can produce.
//
// It reads no credential-kind claim. A JWT that declares itself a platform
// credential gets no special treatment and no special path: it carries no
// kaiten_external_org_id, so it fails the check below and is refused. That is the
// point -- the Core pipeline never routes anything toward platform verification,
// so no claim a caller can write selects a more privileged code path here.
func organizationIdentityFromClaims(claims jwt.MapClaims, tokenString string) (*principal.Principal, error) {
	subject, subjectOk := claims["sub"].(string)
	externalOrgID, orgOk := claims["kaiten_external_org_id"].(string)
	scopesInterface, scopeOk := claims["scopes"].([]any)

	if !subjectOk || subject == "" {
		return nil, kaitenerrors.Unauthorized("Auth.MissingClaims", "Missing required JWT claims (sub)")
	}
	if !orgOk || externalOrgID == "" {
		return nil, kaitenerrors.Unauthorized("Auth.MissingClaims", "Missing required JWT claims (kaiten_external_org_id)")
	}
	if !scopeOk {
		return nil, kaitenerrors.Unauthorized("Auth.MissingClaims", "Missing required JWT claims (scopes)")
	}

	scopes, err := convertScopes(scopesInterface)
	if err != nil {
		return nil, err
	}

	return &principal.Principal{
		Token:  tokenString,
		Kind:   principal.KindOrganization,
		Scopes: scopes,
		Provisioning: principal.Provisioning{
			Subject:                subject,
			Email:                  claimString(claims, "email"),
			Name:                   claimString(claims, "name"),
			OrganizationName:       claimString(claims, "kaiten_org_name"),
			ExternalOrganizationID: externalOrgID,
		},
	}, nil
}

func claimString(claims jwt.MapClaims, key string) string {
	value, _ := claims[key].(string)
	return value
}

func convertScopes(scopesInterface []any) ([]string, error) {
	scopes := make([]string, 0, len(scopesInterface))
	for _, scope := range scopesInterface {
		scopeStr, ok := scope.(string)
		if !ok {
			return nil, kaitenerrors.Unauthorized("Auth.InvalidScopes", "Scopes must be an array of strings")
		}
		scopes = append(scopes, scopeStr)
	}
	return scopes, nil
}
