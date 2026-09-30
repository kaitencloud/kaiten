package entitlements_test

import (
	"os"
	"strconv"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	addentitlementtogroup "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/addentitlementtogroup"
	createEntitlement2 "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	createentitlementgroup "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlementgroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
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

func createEntitlements(t *testing.T, count int) []*schema.Entitlement {
	repo := createEntitlement2.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	entitlements := make([]*schema.Entitlement, 0, count)

	for i := range count {
		description := "Test entitlement " + strconv.Itoa(i)
		slug := "test-" + strconv.Itoa(i)
		entitlement, err := repo.CreateEntitlement(
			t.Context(),
			createEntitlement2.CreateEntitlementInput{
				Name:        "test" + strconv.Itoa(i),
				Slug:        slug,
				Description: &description,
				Type:        schema.Boolean,
			},
			testDb.DefaultData.OrganizationID,
		)

		require.NoError(t, err)
		entitlements = append(entitlements, entitlement)
	}

	return entitlements
}

func createNumberEntitlementWithUnits(t *testing.T, slug string) *schema.Entitlement {
	repo := createEntitlement2.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	aggregationMethod := schema.Sum
	unitSingular := "seat"
	unitPlural := "seats"
	saleUnitSingular := "pack"
	saleUnitPlural := "packs"
	saleUnitFactor := 3.0

	entitlement, err := repo.CreateEntitlement(
		t.Context(),
		createEntitlement2.CreateEntitlementInput{
			Name:              "Seats " + slug,
			Slug:              slug,
			Type:              schema.Number,
			AggregationMethod: &aggregationMethod,
			UnitSingular:      &unitSingular,
			UnitPlural:        &unitPlural,
			SaleUnitSingular:  &saleUnitSingular,
			SaleUnitPlural:    &saleUnitPlural,
			SaleUnitFactor:    &saleUnitFactor,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return entitlement
}

func createEntitlementGroup(
	t *testing.T,
	name string,
	slug string,
) *schema.EntitlementGroup {
	repo := createentitlementgroup.NewCommandRepository(
		uow.NewUnitOfWork(testServer.Dependencies.DB),
	)

	group, err := repo.CreateEntitlementGroup(
		t.Context(),
		createentitlementgroup.CreateEntitlementGroupInput{
			Name: name,
			Slug: slug,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return group
}

func addEntitlementToGroup(
	t *testing.T,
	groupSlug string,
	entitlementSlug string,
) {
	repo := addentitlementtogroup.NewCommandRepository(
		uow.NewUnitOfWork(testServer.Dependencies.DB),
	)

	_, err := repo.AddEntitlementToGroup(
		t.Context(),
		groupSlug,
		entitlementSlug,
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
}
