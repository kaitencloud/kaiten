package createpublishablekey

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
)

const operation = "CreatePublishableKey"

// Draft is a key to issue.
type PublishableKeyDraft struct {
	Label          string   `json:"label" minLength:"1" maxLength:"100" doc:"What the key is for" example:"Marketing site"`
	AllowedOrigins []string `json:"allowedOrigins" nullable:"false" maxItems:"50" doc:"Browser origins allowed to send the key, as scheme://host[:port]: https, or http for localhost. Empty: no browser origin may." example:"[\"https://www.example.com\"]"`
	// The anonymous checkout (V32-01, §13.12): off by default, and on only
	// with both Turnstile values.
	AnonymousCheckout *bool   `json:"anonymousCheckout,omitempty" doc:"Open POST /public/checkout-sessions to the key. Needs turnstileSiteKey and turnstileSecret, else 422 .TurnstileNotConfigured. False by default."`
	TurnstileSiteKey  *string `json:"turnstileSiteKey,omitempty" pattern:"^[A-Za-z0-9_-]{1,255}$" doc:"The Turnstile site key the page renders its widget with"`
	TurnstileSecret   *string `json:"turnstileSecret,omitempty" minLength:"1" maxLength:"255" doc:"The Turnstile secret the server verifies tokens with. Stored in Vault, never returned: reads say turnstileSecretConfigured. 422 .VaultNotConfigured on a deployment without Vault."`
}

type UseCase struct {
	deps   keys.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps keys.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute issues a key and returns its plaintext, the only time it is shown.
func (u *UseCase) Execute(ctx context.Context, draft PublishableKeyDraft) (*keys.PublishableKeyCreated, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	label, err := keys.ValidateLabel(operation, draft.Label)
	if err != nil {
		return nil, err
	}
	origins, err := keys.NormalizeOrigins(operation, draft.AllowedOrigins)
	if err != nil {
		return nil, err
	}
	anonymous := draft.AnonymousCheckout != nil && *draft.AnonymousCheckout
	if draft.TurnstileSecret != nil {
		if err := keys.RequireVault(operation, u.deps.Secrets); err != nil {
			return nil, err
		}
	}
	if err := keys.RequireTurnstile(operation, anonymous, draft.TurnstileSiteKey != nil, draft.TurnstileSecret != nil); err != nil {
		return nil, err
	}
	plaintext, lookupHash, hint, err := keys.Mint()
	if err != nil {
		return nil, err
	}
	// The secret goes to Vault first, under the key's id, and the row then
	// records that one is set: a row never says it holds a secret Vault lacks.
	id := uuid.New()
	var secretSetAt pgtype.Timestamp
	if draft.TurnstileSecret != nil {
		if err := u.deps.Secrets.Put(ctx, user.OrganizationID, id, *draft.TurnstileSecret); err != nil {
			return nil, err
		}
		secretSetAt = pgtype.Timestamp{Time: time.Now().UTC().Truncate(time.Millisecond), Valid: true}
	}
	var created keys.PublishableKey
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		row, err := u.deps.Queries(ctx).CreatePublishableKey(ctx, db.CreatePublishableKeyParams{
			ID:                   id,
			OrganizationID:       user.OrganizationID,
			Label:                label,
			LookupHash:           lookupHash,
			KeyHint:              hint,
			AllowedOrigins:       origins,
			AnonymousCheckout:    anonymous,
			TurnstileSiteKey:     draft.TurnstileSiteKey,
			TurnstileSecretSetAt: secretSetAt,
			ActorID:              user.ID,
		})
		if err != nil {
			return err
		}
		created = keys.FromRow(row)
		return keys.Announce(ctx, u.outbox, user.OrganizationID, events.PublishableKeyCreated, created)
	})
	if err != nil {
		if secretSetAt.Valid {
			// No key holds it: best effort, an orphan secret is harmless.
			if derr := u.deps.Secrets.Delete(context.WithoutCancel(ctx), user.OrganizationID, id); derr != nil {
				slog.WarnContext(ctx, "publishable key: orphan Turnstile secret left in Vault", "key_id", id, "error", derr)
			}
		}
		return nil, err
	}
	return &keys.PublishableKeyCreated{PublishableKey: created, Key: plaintext}, nil
}
