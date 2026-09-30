package identity_test

import (
	"fmt"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	identitydb "github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
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

func createSA(t *testing.T, name, externalID string, organizationID uuid.UUID) (*identitydb.CreateServiceAccountRow, error) {
	slug, err := slugutil.GenerateUnique(name)
	require.NoError(t, err)

	return createSAWithSlug(t, name, slug, externalID, organizationID)
}

// createSAWithSlug pins the slug instead of generating a unique one, so a
// test can give two organizations a service account with the SAME slug --
// legitimate, since idx_unique_machine_slug_per_org scopes uniqueness to
// the organization.
func createSAWithSlug(t *testing.T, name, slug, externalID string, organizationID uuid.UUID) (*identitydb.CreateServiceAccountRow, error) {
	saArgs := identitydb.CreateServiceAccountParams{
		Name:           name,
		Slug:           &slug,
		CreatorID:      testDb.DefaultData.UserID,
		ExternalID:     externalID,
		OrganizationID: &organizationID,
	}

	sa, err := identitydb.New(testServer.Dependencies.DB).CreateServiceAccount(t.Context(), saArgs)
	if err != nil {
		return nil, err
	}

	userOnOrganizationArgs := organizationdb.CreateUserOnOrganizationParams{
		UserID:         sa.ID,
		OrganizationID: organizationID,
	}

	_, err = organizationdb.New(testServer.Dependencies.DB).CreateUserOnOrganization(t.Context(), userOnOrganizationArgs)
	if err != nil {
		return nil, err
	}

	return &sa, nil
}

func createOrganization(t *testing.T) (uuid.UUID, error) {
	organization, err := organizationdb.New(testServer.Dependencies.DB).CreateOrganization(t.Context(), organizationdb.CreateOrganizationParams{
		ID:         nil,
		ExternalID: "org-" + uuid.NewString(),
		Name:       "Other Organization",
	})
	if err != nil {
		return uuid.Nil, err
	}

	return organization.ID, nil
}

func createSAS(t *testing.T, count int, organizationID uuid.UUID) ([]*identitydb.CreateServiceAccountRow, error) {
	sas := make([]*identitydb.CreateServiceAccountRow, 0, count)

	for i := range count {
		name := fmt.Sprintf("fake-name-%d", i)
		externalID := fmt.Sprintf("fake-sa-external-id-%d", i)

		sa, err := createSA(t, name, externalID, organizationID)
		if err != nil {
			return nil, err
		}
		sas = append(sas, sa)
	}

	return sas, nil
}
