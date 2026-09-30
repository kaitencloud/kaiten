package metadatafields_test

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/tests"
)

var (
	testDb     *tests.TestDatabase
	testServer *tests.TestServer
)

func TestMain(m *testing.M) {
	var err error
	testDb, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	defer testDb.TearDown()

	testServer = tests.NewTestServer(testDb)

	code := m.Run()
	os.Exit(code)
}

// insertField is a low-level helper to seed metadata_field rows directly
// (bypasses the API). Returns the inserted row's id.
func insertField(
	t *testing.T,
	resourceType metadatafieldsdb.MetadataFieldResourceType,
	key, label string,
	jsonSchema map[string]any,
	displayOrder int32,
) uuid.UUID {
	t.Helper()
	schemaBytes, err := json.Marshal(jsonSchema)
	require.NoError(t, err)
	row, err := metadatafieldsdb.New(testServer.Dependencies.DB).InsertMetadataField(context.Background(), metadatafieldsdb.InsertMetadataFieldParams{
		OrganizationID: testDb.DefaultData.OrganizationID,
		ResourceType:   resourceType,
		Key:            key,
		Label:          label,
		JsonSchema:     schemaBytes,
		DisplayOrder:   displayOrder,
		UserID:         testDb.DefaultData.UserID,
	})
	require.NoError(t, err)
	return row.ID
}
