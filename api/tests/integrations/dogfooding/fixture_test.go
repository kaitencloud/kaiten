package dogfooding_test

import (
	"os"
	"testing"

	"github.com/kaitencloud/kaiten/api/tests"
)

var testDb *tests.TestDatabase

func TestMain(m *testing.M) {
	var err error
	testDb, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	defer testDb.TearDown()

	code := m.Run()
	os.Exit(code)
}
