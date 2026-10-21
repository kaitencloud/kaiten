package updatepublishablekey

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "UpdatePublishableKey"

// Patch is what may change on a key. An absent member is left as it is; an
// empty allowedOrigins removes every browser origin, and an empty Turnstile
// value clears it.
type PublishableKeyPatch struct {
	Label             *string   `json:"label,omitempty" minLength:"1" maxLength:"100" doc:"What the key is for"`
	AllowedOrigins    *[]string `json:"allowedOrigins,omitempty" maxItems:"50" doc:"Replaces the allowed browser origins. Takes effect on the next request."`
	AnonymousCheckout *bool     `json:"anonymousCheckout,omitempty" doc:"Open or close POST /public/checkout-sessions to the key. On only with a Turnstile site key and secret, else 422 .TurnstileNotConfigured."`
	TurnstileSiteKey  *string   `json:"turnstileSiteKey,omitempty" pattern:"^[A-Za-z0-9_-]{0,255}$" doc:"The Turnstile site key; \"\" clears it"`
	TurnstileSecret   *string   `json:"turnstileSecret,omitempty" maxLength:"255" doc:"The Turnstile secret, stored in Vault and never returned; \"\" deletes it. 422 .VaultNotConfigured on a deployment without Vault."`
}

type UseCase struct{ deps keys.Deps }

func NewUseCase(deps keys.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute changes a live key's label or origins. A revoked key cannot change.
func (u *UseCase) Execute(ctx context.Context, keyID uuid.UUID, patch PublishableKeyPatch) (*keys.PublishableKey, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	params := db.UpdatePublishableKeyParams{
		Label: nil, AllowedOrigins: nil, ActorID: user.ID, OrganizationID: user.OrganizationID, ID: keyID,
	}
	if patch.Label != nil {
		label, err := keys.ValidateLabel(operation, *patch.Label)
		if err != nil {
			return nil, err
		}
		params.Label = &label
	}
	if patch.AllowedOrigins != nil {
		origins, err := keys.NormalizeOrigins(operation, *patch.AllowedOrigins)
		if err != nil {
			return nil, err
		}
		params.AllowedOrigins = origins
	}

	params.AnonymousCheckout = patch.AnonymousCheckout
	if v := patch.TurnstileSiteKey; v != nil {
		params.SetSiteKey = true
		if *v != "" {
			params.TurnstileSiteKey = v
		}
	}
	newSecret := patch.TurnstileSecret != nil && *patch.TurnstileSecret != ""
	clearSecret := patch.TurnstileSecret != nil && *patch.TurnstileSecret == ""
	if newSecret {
		if err := keys.RequireVault(operation, u.deps.Secrets); err != nil {
			return nil, err
		}
	}

	var updated keys.PublishableKey
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		current, err := q.GetPublishableKeyForUpdate(ctx, db.GetPublishableKeyForUpdateParams{
			OrganizationID: user.OrganizationID, ID: keyID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return keys.NotFound(operation, keyID)
		}
		if err != nil {
			return err
		}
		if current.RevokedAt.Valid {
			return kaitenerrors.Conflict(operation+".Revoked", "a revoked publishable key cannot be changed")
		}
		// The state after the write must hold the Turnstile rule.
		anonymous := current.AnonymousCheckout
		if params.AnonymousCheckout != nil {
			anonymous = *params.AnonymousCheckout
		}
		hasSiteKey := current.TurnstileSiteKey != nil
		if params.SetSiteKey {
			hasSiteKey = params.TurnstileSiteKey != nil
		}
		hasSecret := (current.TurnstileSecretSetAt.Valid || newSecret) && !clearSecret
		if err := keys.RequireTurnstile(operation, anonymous, hasSiteKey, hasSecret); err != nil {
			return err
		}
		// A new secret reaches Vault before the row says it is set; one
		// cleared leaves Vault after the commit.
		if newSecret {
			if err := u.deps.Secrets.Put(ctx, user.OrganizationID, keyID, *patch.TurnstileSecret); err != nil {
				return err
			}
			params.SetSecret = true
			params.TurnstileSecretSetAt = pgtype.Timestamp{Time: time.Now().UTC().Truncate(time.Millisecond), Valid: true}
		} else if clearSecret {
			params.SetSecret = true
		}
		row, err := q.UpdatePublishableKey(ctx, params)
		if err != nil {
			return err
		}
		updated = keys.FromRow(row)
		return nil
	})
	if err != nil {
		return nil, err
	}
	if clearSecret && u.deps.Secrets != nil {
		if err := u.deps.Secrets.Delete(context.WithoutCancel(ctx), user.OrganizationID, keyID); err != nil {
			slog.WarnContext(ctx, "publishable key: cleared Turnstile secret left in Vault", "key_id", keyID, "error", err)
		}
	}
	return &updated, nil
}
