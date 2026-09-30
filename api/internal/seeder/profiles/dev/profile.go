// Package dev implements the local-development seed profile for the OSS-only
// local stack: the five TMNT identities on the Kaiten Sushi Shop org shell,
// no product data, usable straight away with the dev HS256 JWTs `seeder
// tokens` mints. No identity provider is involved.
//
// This is the identity/org-shell half of what the `demo` profile does in
// full (org + users + full product data) -- it delegates to
// demo.EnsureOrganizationAndUsers rather than duplicating it, so `task up`
// (accounts, no product data) and `task quickstart` (accounts + `demo`'s
// product data) agree on exactly one org.
package dev

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/seeder"
	"github.com/kaitencloud/kaiten/api/internal/seeder/profiles/demo"
)

var _ seeder.Profile = (*Profile)(nil)

// Profile is the local dev seed profile.
type Profile struct{}

// NewProfile returns a new dev Profile instance.
func NewProfile() *Profile { return &Profile{} }

func (p *Profile) Name() string { return "dev" }

func (p *Profile) Description() string {
	return "[LOCAL DEV] Seeds the five TMNT identities on the Kaiten Sushi Shop org shell, no product data. Use --clean to reset."
}

func (p *Profile) Seed(ctx context.Context, sc *seeder.SeederContext) error {
	_, _, err := demo.EnsureOrganizationAndUsers(ctx, sc)
	return err
}
