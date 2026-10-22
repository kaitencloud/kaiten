package seeder

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	usersdb "github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	pgerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// EnsureOrganization inserts the organization or, on a unique-constraint conflict,
// fetches the existing row and returns its ID.
func (sc *SeederContext) EnsureOrganization(ctx context.Context, arg organizationdb.CreateOrganizationParams) (uuid.UUID, error) {
	org, err := organizationdb.New(sc.pool).CreateOrganization(ctx, arg)
	var actualID uuid.UUID
	if err == nil {
		actualID = org.ID
	} else if pgerrors.IsUniqueViolation(err) {
		row := sc.pool.QueryRow(ctx, `SELECT id FROM organization WHERE external_id = $1`, arg.ExternalID)
		if scanErr := row.Scan(&actualID); scanErr != nil {
			if !errors.Is(scanErr, pgx.ErrNoRows) {
				return uuid.Nil, fmt.Errorf("seeder: lookup org %q: %w", arg.ExternalID, scanErr)
			}

			configuredID, ok := arg.ID.(uuid.UUID)
			if !ok || configuredID == uuid.Nil {
				return uuid.Nil, fmt.Errorf("seeder: lookup org %q: %w", arg.ExternalID, scanErr)
			}

			row = sc.pool.QueryRow(ctx, `SELECT id FROM organization WHERE id = $1`, configuredID)
			if scanErr = row.Scan(&actualID); scanErr != nil {
				return uuid.Nil, fmt.Errorf("seeder: lookup org %q by id %q: %w", arg.ExternalID, configuredID, scanErr)
			}

			if _, updateErr := sc.pool.Exec(ctx, `UPDATE organization SET external_id = $1 WHERE id = $2 AND external_id IS DISTINCT FROM $1`, arg.ExternalID, actualID); updateErr != nil {
				return uuid.Nil, fmt.Errorf("seeder: update organization %q external_id: %w", actualID, updateErr)
			}
		}
	} else {
		return uuid.Nil, err
	}

	if _, err := organizationdb.New(sc.pool).UpdateOrganizationIdentity(ctx, organizationdb.UpdateOrganizationIdentityParams{
		ID:         actualID,
		ExternalID: arg.ExternalID,
		Name:       arg.Name,
	}); err != nil {
		return uuid.Nil, fmt.Errorf("seeder: update organization %q identity: %w", actualID, err)
	}

	return actualID, nil
}

// EnsureUser inserts the user or, on a unique-constraint conflict, fetches the
// existing row and returns its ID, reconciling external_id (by id, then by
// email) so a user seeded before its external identity was known still ends
// up bound to the right one.
func (sc *SeederContext) EnsureUser(ctx context.Context, arg usersdb.CreateUserParams) (uuid.UUID, error) {
	user, err := usersdb.New(sc.pool).CreateUser(ctx, arg)
	var actualID uuid.UUID
	if err == nil {
		actualID = user.ID
	} else if pgerrors.IsUniqueViolation(err) {
		row := sc.pool.QueryRow(ctx, `SELECT id FROM "user" WHERE external_id = $1`, arg.ExternalID)
		if scanErr := row.Scan(&actualID); scanErr != nil {
			if !errors.Is(scanErr, pgx.ErrNoRows) {
				return uuid.Nil, fmt.Errorf("seeder: lookup user %q: %w", arg.ExternalID, scanErr)
			}

			configuredID, ok := arg.ID.(uuid.UUID)
			if !ok || configuredID == uuid.Nil {
				return uuid.Nil, fmt.Errorf("seeder: lookup user %q: %w", arg.ExternalID, scanErr)
			}

			row = sc.pool.QueryRow(ctx, `SELECT id FROM "user" WHERE id = $1`, configuredID)
			if scanErr = row.Scan(&actualID); scanErr != nil {
				if !errors.Is(scanErr, pgx.ErrNoRows) {
					return uuid.Nil, fmt.Errorf("seeder: lookup user %q by id %q: %w", arg.ExternalID, configuredID, scanErr)
				}
			}

			if actualID != uuid.Nil {
				if _, updateErr := sc.pool.Exec(ctx, `UPDATE "user" SET external_id = $1 WHERE id = $2 AND external_id IS DISTINCT FROM $1`, arg.ExternalID, actualID); updateErr != nil {
					return uuid.Nil, fmt.Errorf("seeder: update user %q external_id: %w", actualID, updateErr)
				}

				slog.InfoContext(
					ctx, "seeder: reconciled user external_id",
					"user_id", actualID,
					"external_id", arg.ExternalID,
				)
			}
		}

		if actualID == uuid.Nil && arg.Email != nil && *arg.Email != "" {
			row = sc.pool.QueryRow(ctx, `SELECT id FROM "user" WHERE email = $1`, arg.Email)
			if scanErr := row.Scan(&actualID); scanErr != nil {
				if !errors.Is(scanErr, pgx.ErrNoRows) {
					return uuid.Nil, fmt.Errorf("seeder: lookup user by email %q: %w", *arg.Email, scanErr)
				}
				return uuid.Nil, fmt.Errorf("seeder: lookup user %q: %w", arg.ExternalID, err)
			}

			if _, updateErr := sc.pool.Exec(ctx, `UPDATE "user" SET external_id = $1 WHERE id = $2 AND external_id IS DISTINCT FROM $1`, arg.ExternalID, actualID); updateErr != nil {
				return uuid.Nil, fmt.Errorf("seeder: update user %q external_id by email: %w", actualID, updateErr)
			}

			slog.InfoContext(
				ctx, "seeder: reconciled user by email",
				"user_id", actualID,
				"email", *arg.Email,
				"external_id", arg.ExternalID,
			)
		}
	} else {
		return uuid.Nil, err
	}

	if _, err := sc.pool.Exec(ctx, `UPDATE "user" SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`, actualID); err != nil {
		return uuid.Nil, fmt.Errorf("seeder: restore user %q: %w", actualID, err)
	}

	if err := usersdb.New(sc.pool).UpdateUserName(ctx, usersdb.UpdateUserNameParams{
		ID:   actualID,
		Name: arg.Name,
	}); err != nil {
		return uuid.Nil, fmt.Errorf("seeder: update user %q name: %w", actualID, err)
	}

	if err := usersdb.New(sc.pool).UpdateUserEmail(ctx, usersdb.UpdateUserEmailParams{
		ID:    actualID,
		Email: arg.Email,
	}); err != nil {
		return uuid.Nil, fmt.Errorf("seeder: update user %q email: %w", actualID, err)
	}

	return actualID, nil
}

// EnsureUserOnOrganization creates or restores the user-org membership.
// EnsureUserOnOrganization also gives explicitly seeded demo humans local
// administrator assignments. Ordinary JIT provisioning never calls this helper.
func (sc *SeederContext) EnsureUserOnOrganization(ctx context.Context, arg organizationdb.CreateUserOnOrganizationParams) error {
	_, err := organizationdb.New(sc.pool).CreateUserOnOrganization(ctx, arg)
	if err != nil && !pgerrors.IsUniqueViolation(err) {
		return err
	}
	_, err = sc.pool.Exec(ctx, `
 INSERT INTO user_organization_authorization(organization_id,user_id,roles)
 SELECT $1,$2,ARRAY['administrator']::text[] FROM "user"
 WHERE id=$2 AND type='human' AND deleted_at IS NULL
 ON CONFLICT(organization_id,user_id) DO NOTHING`, arg.OrganizationID, arg.UserID)
	return err
}
