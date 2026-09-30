package deploymentzones_test

import (
	"os"
	"strconv"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeploymentzone"
	deploymentzonesschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/createrelease"
	releasesschema "github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
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

func createDeploymentZones(t *testing.T, count int) []*deploymentzonesschema.DeploymentZone {
	repo := createdeploymentzone.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	deploymentZones := make([]*deploymentzonesschema.DeploymentZone, 0, count)

	for i := range count {
		name := "dz_" + strconv.Itoa(i)
		deploymentZone, err := repo.CreateDeploymentZone(
			t.Context(),
			name,
			"dz-"+strconv.Itoa(i),
			"dz_type_dummy",
			nil,
			"dummy deployment zone description",
			nil,
			testDb.DefaultData.OrganizationID,
			testDb.DefaultData.UserID,
		)

		require.NoError(t, err)
		deploymentZones = append(deploymentZones, deploymentZone)
	}

	return deploymentZones
}

func createReleases(t *testing.T, count int) []*releasesschema.Release {
	repo := createrelease.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	releases := make([]*releasesschema.Release, 0, count)

	for i := range count {
		release, err := repo.CreateRelease(
			t.Context(),
			"rl_"+strconv.Itoa(i),
			"rl-"+strconv.Itoa(i),
			ptr.To("rl_description_dummy"),
			testDb.DefaultData.OrganizationID,
			testDb.DefaultData.UserID,
		)

		require.NoError(t, err)
		releases = append(releases, release)
	}

	return releases
}
