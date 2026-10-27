// Package createsessionportalsession is POST
// /public/session/billing/portal-session (§14.4): the payment provider's
// customer portal, for the session's customer, opened as the Core operation
// opens it (§12.5). What the customer changes there reaches Kaiten through
// the provider sync.
package createsessionportalsession

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createportalsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	operation = "CreateSessionPortalSession"
	core      = "CreatePortalSession"
)

// NewSessionPortalSession is the portal a session asks for.
type NewSessionPortalSession struct {
	ReturnURL string `json:"returnUrl" format:"uri" doc:"Where the portal sends the customer back. Its origin must be one the organization's publishable keys allow." example:"https://app.example.test/billing"`
}

// Session is the customer session the portal is opened for.
type Session struct {
	CustomerSlug   string
	AllowedOrigins []string
}

// Opener is the billing module's operation, through a port this module owns.
type Opener interface {
	Execute(ctx context.Context, customerSlug string, cmd createportalsession.NewPortalSession) (*createportalsession.PortalSession, error)
}

type UseCase struct{ open Opener }

func NewUseCase(open Opener) *UseCase { return &UseCase{open: open} }

// Execute opens the portal for the session's customer.
func (u *UseCase) Execute(ctx context.Context, session Session, request NewSessionPortalSession) (*createportalsession.PortalSession, error) {
	if !sessions.AllowedReturn(request.ReturnURL, session.AllowedOrigins) {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidReturnUrl",
			"returnUrl must be an https URL on an origin the vendor's publishable keys allow")
	}
	opened, err := u.open.Execute(ctx, session.CustomerSlug, createportalsession.NewPortalSession{ReturnURL: request.ReturnURL})
	if err != nil {
		return nil, sessions.Rename(err, core, operation)
	}
	return opened, nil
}
