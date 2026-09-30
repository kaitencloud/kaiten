package auth

import (
	"context"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// PlatformCredentialValidator resolves a raw `ksm_` credential.
//
// Declared here as a one-method interface rather than imported, so this package
// keeps depending on nothing but the vocabulary packages. The implementation is
// identity/validateplatformtoken, wired in by the server, which is also what puts
// the identity module's shared credential cache behind it -- see that package's
// doc for why the cache has to be the shared one.
//
// It reports ok rather than an error because "this credential does not
// authenticate" is an ordinary answer, not a failure: every reason for it
// produces the same false, so this middleware has one refusal to write and no way
// to leak which check stopped a caller.
type PlatformCredentialValidator interface {
	ValidatePlatformToken(
		ctx context.Context, plainToken string,
	) (tokenID uuid.UUID, scopes []string, ok bool)
}

// PlatformMiddleware authenticates the Platform API, and only the Platform API.
type PlatformMiddleware struct {
	validator PlatformCredentialValidator
}

// NewPlatform builds the Platform API's authentication middleware.
//
// It takes no signing key, and there is none left in the process to pass: with the
// JWT exchange gone, KAITEN_PLATFORM_JWT_SIGNING_KEY is not read, not required at
// startup, and not deployed.
func NewPlatform(validator PlatformCredentialValidator) *PlatformMiddleware {
	return &PlatformMiddleware{validator: validator}
}

func (p *PlatformMiddleware) Authorization() fiber.Handler {
	return func(ctx fiber.Ctx) error {
		tokenString, err := extractBearerToken(ctx)
		if err != nil {
			return err
		}

		// Shape first, and this is the credential-class refusal rather than an
		// authentication one: a `ksh_` here is a well-formed credential presented to
		// the wrong surface, and it gets the same 403 and the same code an
		// organization credential got when this listener spoke JWTs -- and that
		// caller.Organization gives on the Core API in the other direction.
		//
		// Answering by prefix means an organization credential is refused without
		// being looked up, so this listener never touches the tenant credential
		// table and cannot become an oracle for it.
		if !strings.HasPrefix(tokenString, token.PrefixPlatform) {
			return kaitenerrors.Forbidden(principal.ErrCodeWrongCredentialKind,
				principal.ErrMsgWrongCredentialKind)
		}

		platformTokenID, scopes, ok := p.validator.ValidatePlatformToken(ctx.Context(), tokenString)
		if !ok {
			// One message for every rejection past the prefix: no such row, a hash
			// mismatch, an expired or revoked credential. A caller learns the
			// credential did not work and nothing about which check stopped it.
			return kaitenerrors.Unauthorized("Auth.InvalidPlatformToken", "Invalid platform token")
		}

		ctx.SetContext(principal.ContextWithPrincipal(ctx.Context(), &principal.Principal{
			Token: tokenString,
			Kind:  principal.KindPlatform,
			// The platform identity's own row id, pinned by a migration rather than
			// read off the credential. JIT does not run on this listener at all -- it
			// would upsert an organization, which is the implicit attachment this
			// whole design forbids -- so the principal has to be complete here.
			UserID:          platformidentity.ID,
			OrganizationID:  uuid.Nil,
			PlatformTokenID: platformTokenID,
			Scopes:          scopes,
			// No Provisioning: there is nothing to provision. The identity already
			// exists -- a migration created it -- and it has no organization to resolve.
			Provisioning: principal.Provisioning{},
		}))
		return ctx.Next()
	}
}

// Compile-time proof that both middlewares satisfy the same interface: the server
// holds one of each, and nothing but the field it is stored in decides which
// listener a given one authenticates.
var (
	_ Middleware = (*JWTMiddleware)(nil)
	_ Middleware = (*PlatformMiddleware)(nil)
)
