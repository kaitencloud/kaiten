package createpublishablekey

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
)

const operation = "CreatePublishableKey"

// Draft is a key to issue.
type PublishableKeyDraft struct {
	Label          string   `json:"label" minLength:"1" maxLength:"100" doc:"What the key is for" example:"Marketing site"`
	AllowedOrigins []string `json:"allowedOrigins" nullable:"false" maxItems:"50" doc:"Browser origins allowed to send the key, as scheme://host[:port]: https, or http for localhost. Empty: no browser origin may." example:"[\"https://www.example.com\"]"`
}

type UseCase struct{ deps keys.Deps }

func NewUseCase(deps keys.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute issues a key and returns its plaintext, the only time it is shown.
func (u *UseCase) Execute(ctx context.Context, draft PublishableKeyDraft) (*keys.PublishableKeyCreated, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
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
	plaintext, lookupHash, hint, err := keys.Mint()
	if err != nil {
		return nil, err
	}
	row, err := u.deps.Queries(ctx).CreatePublishableKey(ctx, db.CreatePublishableKeyParams{
		OrganizationID: user.OrganizationID,
		Label:          label,
		LookupHash:     lookupHash,
		KeyHint:        hint,
		AllowedOrigins: origins,
		ActorID:        user.ID,
	})
	if err != nil {
		return nil, err
	}
	return &keys.PublishableKeyCreated{
		PublishableKey: keys.FromRow(row.ID, row.Label, row.KeyHint, row.AllowedOrigins,
			row.LastUsedAt, row.CreatedAt, row.UpdatedAt, row.RevokedAt),
		Key: plaintext,
	}, nil
}
