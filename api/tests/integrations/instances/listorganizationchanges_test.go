package instances_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	auditdb "github.com/kaitencloud/kaiten/api/internal/modules/audittrail/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/listfororganization"
)

func TestOrganizationAuditTrailChangesOnly(t *testing.T) {
	const sdkEvents = 5

	arrange := func(t *testing.T) *listfororganization.UseCase {
		t.Helper()
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		newAuditTrailEntry(t, instances[0].Slug, "CUSTOMER_CREATED")
		for range sdkEvents {
			newAuditTrailEntry(t, instances[0].Slug, "ENTITLEMENT_VALUE_GET")
		}
		return listfororganization.NewUseCase(auditdb.New(testDb.DbPool))
	}

	t.Run("WhenSDKEventsFillThePage_TheChangeBehindThemIsStillRead", func(t *testing.T) {
		uc := arrange(t)

		entries, err := uc.Execute(t.Context(), testDb.DefaultData.OrganizationID, nil, true, nil, nil, 2, nil)

		require.NoError(t, err)
		require.Len(t, entries, 1)
		require.Equal(t, "CUSTOMER_CREATED", entries[0].EventName)
	})

	t.Run("WhenNotAsked_TheWholeTrailIsRead", func(t *testing.T) {
		uc := arrange(t)

		entries, err := uc.Execute(t.Context(), testDb.DefaultData.OrganizationID, nil, false, nil, nil, 100, nil)

		require.NoError(t, err)
		require.Len(t, entries, sdkEvents+1)
	})
}
