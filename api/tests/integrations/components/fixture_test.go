package components_test

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/createcomponent"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
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

func createComponentDirectly(
	t *testing.T,
	name string,
	version string,
	description *string,
) *componentschema.Component {
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
