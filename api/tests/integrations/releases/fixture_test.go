package releases_test

import (
	"os"
	"strconv"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/createcomponent"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeployment"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeploymentzone"
	deploymentzonesdb "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/createrelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
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

func createReleases(t *testing.T, count int) []*schema.Release {
	repo := createrelease.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	releases := make([]*schema.Release, 0, count)

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

// deployRelease pins the release to a freshly created deployment zone, so the
// deployment row references it and the ON DELETE RESTRICT foreign key applies.
func deployRelease(t *testing.T, releaseID uuid.UUID) {
	t.Helper()

	zone, err := createdeploymentzone.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateDeploymentZone(
		t.Context(),
		"dz_"+releaseID.String(),
		"dz-"+releaseID.String(),
		"dz_type_dummy",
		nil,
		"dummy deployment zone description",
		nil,
		testDb.DefaultData.OrganizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)

	_, err = createdeployment.NewCommandRepository(deploymentzonesdb.New(testServer.Dependencies.DB)).CreateDeployment(
		t.Context(),
		zone.ID,
		releaseID,
		testDb.DefaultData.OrganizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)
}

func newComponent(t *testing.T, name string, version string, description *string) *componentschema.Component {
	t.Helper()

	repo := createcomponent.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	component, err := repo.CreateComponent(
		t.Context(),
		name,
		version,
		slugutil.Generate(name+"-"+version),
		description,
		nil,
		testDb.DefaultData.OrganizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)

	return component
}
