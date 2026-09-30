package graphql

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
)

func TestToInstanceSchemaFromGetOneInstanceRowMapsDeploymentZoneSlug(t *testing.T) {
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)
	customerSlug := "acme"
	licenseSlug := "enterprise"
	deploymentZoneID := uuid.New()
	deploymentZoneSlug := "aws-eu-west-1"

	instance, err := toInstanceSchemaFromGetOneInstanceRow(db.GetOneInstanceRow{
		ID:                 uuid.New(),
		Slug:               "instance-1",
		Status:             db.InstanceStatusHEALTHY,
		Name:               "Instance 1",
		Description:        "Production instance",
		CreatedByID:        uuid.New(),
		CreatedByName:      "Creator",
		CreatedAt:          pgtype.Timestamp{Time: now, Valid: true},
		UpdatedByID:        uuid.New(),
		UpdatedByName:      "Updater",
		UpdatedAt:          pgtype.Timestamp{Time: now, Valid: true},
		CustomerID:         uuid.New(),
		CustomerSlug:       &customerSlug,
		LicenseID:          uuid.New(),
		LicenseSlug:        &licenseSlug,
		DeploymentZoneID:   &deploymentZoneID,
		DeploymentZoneSlug: &deploymentZoneSlug,
		StartLicenseDate:   pgtype.Timestamp{Time: now, Valid: true},
		EndLicenseDate:     pgtype.Timestamp{Time: now.AddDate(1, 0, 0), Valid: true},
		Metadata:           []byte(`{"tier":"production"}`),
	})
	require.NoError(t, err)

	require.Equal(t, schema.InstanceStatusHealthy, instance.Status)
	require.Equal(t, &deploymentZoneID, instance.DeploymentZoneID)
	require.Equal(t, &deploymentZoneSlug, instance.DeploymentZoneSlug)
	require.Equal(t, "production", instance.Metadata["tier"])
}
