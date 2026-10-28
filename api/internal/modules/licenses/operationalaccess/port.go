// Package operationalaccess classifies licence targets for external mutations,
// independently of the raw catalogue used for billing and effective arithmetic.
package operationalaccess

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

func RequireLicense(ctx context.Context, dbtx uow.DBTX, policy aiusage.Policy, org, id uuid.UUID) error {
	ctx = policy.ForOrganization(ctx, org)
	if policy.Enabled(ctx) {
		return nil
	}
	hasAI, err := db.New(dbtx).LicenseHasAI(ctx, db.LicenseHasAIParams{OrganizationID: org, LicenseID: id})
	if err != nil {
		return err
	}
	if hasAI {
		return policy.RequireEnabled(ctx)
	}
	return nil
}

func RequireSlug(ctx context.Context, dbtx uow.DBTX, policy aiusage.Policy, org uuid.UUID, slug string) error {
	ctx = policy.ForOrganization(ctx, org)
	if policy.Enabled(ctx) {
		return nil
	}
	row, err := db.New(dbtx).GetLicenseIDBySlug(ctx, db.GetLicenseIDBySlugParams{OrganizationID: org, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return RequireLicense(ctx, dbtx, policy, org, row.ID)
}
