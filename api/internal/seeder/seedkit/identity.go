package seedkit

import (
	"context"
	"fmt"

	identityschema "github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
)

// SeedServiceAccounts creates each service account and its tokens via the
// identity use cases, returning the minted plain tokens keyed by SA name.
func SeedServiceAccounts(ctx context.Context, sc *seeder.SeederContext, defs []ServiceAccountDef) (map[string][]*identityschema.PlainToken, error) {
	tokens := make(map[string][]*identityschema.PlainToken, len(defs))
	for _, def := range defs {
		_, plain, err := SeedServiceAccount(ctx, sc, def)
		if err != nil {
			return nil, err
		}
		tokens[def.Name] = append(tokens[def.Name], plain...)
	}
	return tokens, nil
}

// SeedServiceAccount creates one service account and its tokens, returning the
// account itself so a profile can go on to seed as it (see
// seeder.SeederContext.WithOrganization).
func SeedServiceAccount(ctx context.Context, sc *seeder.SeederContext, def ServiceAccountDef) (*identityschema.ServiceAccount, []*identityschema.PlainToken, error) {
	sa, err := sc.Identity.CreateServiceAccount.Execute(ctx, def.Name, def.Slug)
	if err != nil {
		return nil, nil, fmt.Errorf("create service account %q: %w", def.Name, err)
	}
	tokens := make([]*identityschema.PlainToken, 0, len(def.Tokens))
	for _, tok := range def.Tokens {
		plain, err := sc.Identity.CreateTokenOnServiceAccount.Execute(ctx, sa.Slug, tok.Name, tok.Slug, tok.Scopes, tok.ExpiresAt)
		if err != nil {
			return nil, nil, fmt.Errorf("create token %q on service account %q: %w", tok.Name, def.Name, err)
		}
		tokens = append(tokens, plain)
	}
	return sa, tokens, nil
}

// MintRotationToken used to live here: it created (or reused) a service account
// and minted a fresh rotation generation of its token, which is how the
// dogfooding credential was produced. Credentials are no longer the seeder's
// business - `kaiten-admin-tools service-token mint --replace` mints that one,
// before the API is even listening. What is left here creates fake service
// accounts for fake data, which is exactly the line this file now sits on.
