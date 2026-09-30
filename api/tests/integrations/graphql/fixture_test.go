package graphql_test

import (
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/createcomponent"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customersdb "github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeployment"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeploymentzone"
	deploymentzonesdb "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	deploymentzonesschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instancesdb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/createrelease"
	releaseschema "github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
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

func newCustomer(t *testing.T, name string) *customerschema.Customer {
	repo := createcustomer.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

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

	return customer
}

// newCustomerIntegration syncs a customer with an integration adapter,
// which is what the customers(hasIntegration:) filter selects on.
func newCustomerIntegration(t *testing.T, customer *customerschema.Customer, adapter string) {
	t.Helper()

	_, err := customersdb.New(testServer.Dependencies.DB).UpsertCustomerIntegration(
		t.Context(),
		customersdb.UpsertCustomerIntegrationParams{
			Adapter:        adapter,
			ExternalID:     "external-" + customer.Slug,
			Metadata:       []byte(`{"source":"customer"}`),
			WebUrl:         nil,
			SyncedAt:       pgtype.Timestamptz{Time: time.Now(), Valid: true},
			LastError:      nil,
			OrganizationID: testDb.DefaultData.OrganizationID,
			CustomerID:     customer.ID,
		},
	)
	require.NoError(t, err)
}

func newLicense(t *testing.T, name string) *licenseschema.License {
	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	versionName := "v1"
	licenseSlug := slugutil.Generate(name)
	request := createlicense.Command{
		Name:        name,
		Slug:        &licenseSlug,
		Description: "Test license description",
		Type:        licenseschema.Development,
		VersionName: &versionName,
	}

	license, err := repo.CreateLicense(
		t.Context(),
		&request,
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return license
}

func newInstance(t *testing.T, name string, customer *customerschema.Customer, license *licenseschema.License) *instanceschema.Instance {
	repo := createinstance.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	instanceSlug := slugutil.Generate(name)
	request := createinstance.Command{
		Name:             name,
		Slug:             &instanceSlug,
		Description:      "Test instance description",
		StartLicenseDate: time.Now(),
		EndLicenseDate:   time.Now().AddDate(1, 0, 0),
		Metadata:         map[string]interface{}{"owner": "team-platform", "tier": "gold"},
		LicenseID:        license.ID,
		CustomerID:       customer.ID,
	}

	instance, err := repo.CreateInstance(
		t.Context(),
		&request,
		testDb.DefaultData.UserID,
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return instance
}

func newInstanceInDeploymentZone(
	t *testing.T,
	name string,
	customer *customerschema.Customer,
	license *licenseschema.License,
	deploymentZone *deploymentzonesschema.DeploymentZone,
) *instanceschema.Instance {
	repo := createinstance.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	instanceSlug := slugutil.Generate(name)
	request := createinstance.Command{
		Name:             name,
		Slug:             &instanceSlug,
		Description:      "Test instance description",
		StartLicenseDate: time.Now(),
		EndLicenseDate:   time.Now().AddDate(1, 0, 0),
		Metadata:         map[string]interface{}{"owner": "team-platform", "tier": "gold"},
		LicenseID:        license.ID,
		CustomerID:       customer.ID,
		DeploymentZoneID: &deploymentZone.ID,
	}

	instance, err := repo.CreateInstance(
		t.Context(),
		&request,
		testDb.DefaultData.UserID,
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return instance
}

// newInstanceIntegration syncs an instance with an integration adapter,
// which is what the instances(hasIntegration:) filter selects on.
func newInstanceIntegration(t *testing.T, instance *instanceschema.Instance, adapter string) {
	t.Helper()

	_, err := instancesdb.New(testServer.Dependencies.DB).UpsertInstanceIntegration(
		t.Context(),
		instancesdb.UpsertInstanceIntegrationParams{
			Adapter:        adapter,
			ExternalID:     "external-" + instance.Slug,
			Metadata:       []byte(`{"source":"instance"}`),
			WebUrl:         nil,
			SyncedAt:       pgtype.Timestamptz{Time: time.Now(), Valid: true},
			LastError:      nil,
			OrganizationID: testDb.DefaultData.OrganizationID,
			InstanceID:     instance.ID,
		},
	)
	require.NoError(t, err)
}

func newRelease(t *testing.T, version string) *releaseschema.Release {
	repo := createrelease.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	releaseSlug := slugutil.Generate(version)

	release, err := repo.CreateRelease(
		t.Context(),
		version,
		releaseSlug,
		nil,
		testDb.DefaultData.OrganizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)

	return release
}

func newComponent(t *testing.T, name string, version string) *componentschema.Component {
	t.Helper()

	repo := createcomponent.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	componentSlug := slugutil.Generate(name + "-" + version)
	component, err := repo.CreateComponent(
		t.Context(),
		name,
		version,
		componentSlug,
		nil,
		nil,
		testDb.DefaultData.OrganizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)

	return component
}

func newReleaseWithComponents(t *testing.T, version string, componentNames []string) *releaseschema.Release {
	repo := createrelease.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	releaseSlug := slugutil.Generate(version)

	release, err := repo.CreateRelease(
		t.Context(),
		version,
		releaseSlug,
		nil,
		testDb.DefaultData.OrganizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)

	// Add components
	for _, name := range componentNames {
		comp := newComponent(t, name, "v1.0.0")

		err = repo.AddComponentToRelease(t.Context(), comp.ID, release.ID, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
	}

	// Fetch components
	components, err := repo.GetComponentsByReleaseID(t.Context(), release.ID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	release.Components = components

	return release
}

func newDeploymentZone(t *testing.T, name string, zoneType string) *deploymentzonesschema.DeploymentZone {
	repo := createdeploymentzone.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	deploymentZone, err := repo.CreateDeploymentZone(
		t.Context(),
		name,
		slugutil.Generate(name),
		zoneType,
		map[string]interface{}{"region": "eu-west-1"},
		"Test deployment zone description",
		nil,
		testDb.DefaultData.OrganizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)

	return deploymentZone
}

func newDeployment(
	t *testing.T,
	deploymentZone *deploymentzonesschema.DeploymentZone,
	release *releaseschema.Release,
) *deploymentzonesschema.Deployment {
	repo := createdeployment.NewCommandRepository(deploymentzonesdb.New(testServer.Dependencies.DB))

	deployment, err := repo.CreateDeployment(
		t.Context(),
		deploymentZone.ID,
		release.ID,
		testDb.DefaultData.OrganizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)

	return deployment
}
