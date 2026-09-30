package getorganization_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/getorganization"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/tests"
)

var testDB *tests.TestDatabase

func TestMain(m *testing.M) {
	var err error
	// Setup TestDatabase using the latest refactor
	testDB, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	// Ensure TearDown is called after the tests
	defer testDB.TearDown()

	m.Run()
}

func TestReaderRepository_GetOrganization(t *testing.T) {
	// Arrange
	ctx := context.Background()
	queries := db.New(testDB.DbPool)
	repo := getorganization.NewQueryRepository(queries)

	// Act: Retrieve the organization from the repository
	organization, err := repo.GetOrganization(ctx, testDB.DefaultData.OrganizationID)

	// Assert: ValidateVariantExists the retrieved organization
	require.NoError(t, err)
	require.Equal(t, testDB.DefaultData.OrganizationID, organization.ID)
	require.NotEmpty(t, organization.ExternalID)
}
