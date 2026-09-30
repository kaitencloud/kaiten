package createdeployment

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	deploymentZoneConstraint    = "deployment_deployment_zone_fkey"
	deploymentReleaseConstraint = "deployment_release_fkey"
)

type CommandRepository struct {
	repository *db.Queries
}

func NewCommandRepository(repository *db.Queries) *CommandRepository {
	return &CommandRepository{
		repository: repository,
	}
}

func (r *CommandRepository) CreateDeployment(ctx context.Context, deploymentZoneID uuid.UUID, releaseID uuid.UUID, organizationID uuid.UUID, userID uuid.UUID) (*schema.Deployment, error) {
	deployment := db.CreateDeploymentParams{
		DeploymentZoneID: deploymentZoneID,
		ReleaseID:        releaseID,
		OrganizationID:   organizationID,
		UserID:           userID,
	}

	d, err := r.repository.CreateDeployment(ctx, deployment)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.Forbidden(
				"CurrentUser.NotInOrganization",
				fmt.Sprintf("User %s does not belong to organization %s", userID, organizationID),
			)
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			switch pgErr.ConstraintName {
			case deploymentZoneConstraint:
				return nil, kaitenerrors.NotFound(
					"CreateDeployment.DeploymentZoneNotFound",
					fmt.Sprintf("Deployment zone with ID %s was not found", deploymentZoneID),
				)
			case deploymentReleaseConstraint:
				return nil, kaitenerrors.NotFound(
					"CreateDeployment.ReleaseNotFound",
					fmt.Sprintf("Release with ID %s was not found", releaseID),
				)
			}
		}
		return nil, err
	}

	return &schema.Deployment{
		ID:               d.ID,
		DeploymentZoneID: d.DeploymentZoneID,
		ReleaseID:        d.ReleaseID,
		CreatedAt:        d.CreatedAt.Time,
		CreatedBy:        shared.User{ID: d.CreatedByID, Name: d.CreatedByName},
	}, nil
}
