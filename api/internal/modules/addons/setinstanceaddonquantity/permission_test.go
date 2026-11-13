package setinstanceaddonquantity

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIncreaseUsesPreparedPermissionAndLockedQuantity(t *testing.T) {
	for _, permission := range []error{nil, errors.New("not entitled"), errors.New("authority unavailable")} {
		for _, quantity := range []int32{0, 1, 2} {
			require.NoError(t, requireIncrease(2, quantity, permission))
		}
		require.Equal(t, permission, requireIncrease(2, 3, permission))
		// The same request becomes an increase if another writer reduced the
		// quantity before this transaction acquired its lock.
		require.NoError(t, requireIncrease(5, 4, permission))
		require.Equal(t, permission, requireIncrease(2, 4, permission))
	}
}
