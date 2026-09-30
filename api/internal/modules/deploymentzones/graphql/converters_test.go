package graphql

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
)

func TestToDeploymentZoneSchemaMapsMetadata(t *testing.T) {
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)
	releaseID := uuid.New()

	deploymentZone, err := toDeploymentZoneSchema(db.GetDeploymentZonesByIDsRow{
		ID:            uuid.New(),
		Name:          "AWS EU West 1",
		Slug:          "aws-eu-west-1",
		Description:   "Primary EU zone",
		Type:          "aws",
		Metadata:      []byte(`{"region":"eu-west-1"}`),
		CreatedByID:   uuid.New(),
		CreatedByName: "Creator",
		CreatedAt:     pgtype.Timestamp{Time: now, Valid: true},
		UpdatedByID:   uuid.New(),
		UpdatedByName: "Updater",
		UpdatedAt:     pgtype.Timestamp{Time: now, Valid: true},
		ReleaseID:     releaseID,
	})
	require.NoError(t, err)

	require.Equal(t, "aws-eu-west-1", deploymentZone.Slug)
	require.Equal(t, "eu-west-1", deploymentZone.Metadata["region"])
	require.Equal(t, &releaseID, deploymentZone.ReleaseID)
}
