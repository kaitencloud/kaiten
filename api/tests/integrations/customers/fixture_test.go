package customers_test

import (
	"os"
	"strconv"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
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

// createNeighbourOrganization inserts a second organization and makes the
// default test user a member of it, so a test can own the same customer
// slug in two tenants and assert that a write in one never reaches the
// other. Membership of both organizations is what a customer update lacking its
// organization filter would have needed to reach both.
func createNeighbourOrganization(t *testing.T) uuid.UUID {
	t.Helper()

	organizationID := uuid.New()
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `
		INSERT INTO organization (id, external_id, name)
		VALUES ($1, $2, 'Neighbour Organization')
	`, organizationID, "organization-external-"+organizationID.String())
	require.NoError(t, err)

	_, err = testServer.Dependencies.DB.Exec(t.Context(), `
		INSERT INTO user_on_organization (organization_id, user_id)
		VALUES ($1, $2)
	`, organizationID, testDb.DefaultData.UserID)
	require.NoError(t, err)

	return organizationID
}

func createCustomerIn(t *testing.T, organizationID uuid.UUID, name, slug string) *schema.Customer {
	t.Helper()

	repo := createcustomer.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	customer, err := repo.CreateCustomer(
		t.Context(),
		name,
		slug,
		nil,
		nil,
		organizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)

	return customer
}

func createCustomers(t *testing.T, count int) []*schema.Customer {
	repo := createcustomer.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	customers := make([]*schema.Customer, 0, count)

	for i := range count {
		name := "test" + strconv.Itoa(i)
		customer, err := repo.CreateCustomer(
			t.Context(),
			name,
			slugutil.Generate(name),
			nil,
			nil,
			testDb.DefaultData.OrganizationID,
			testDb.DefaultData.UserID,
		)
		require.NoError(t, err)
		customers = append(customers, customer)
	}

	return customers
}
