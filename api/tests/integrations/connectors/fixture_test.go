// Package connectors_test exercises the organization-level half of a connector --
// activation, the licence gate, and the state the console reads -- against a real
// Postgres and the real Fiber app.
//
// It needs both: the properties under test are about a row in organization_connector
// and a secret in the settings store staying in step, and about one organization's
// activation not being another's.
package connectors_test

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

	os.Exit(m.Run())
}
