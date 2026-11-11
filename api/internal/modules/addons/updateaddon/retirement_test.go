package updateaddon

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
)

func TestOnlyUnsetDefaultDoesNotAllowBundledCatalogueChanges(t *testing.T) {
	max := int32(5)
	version := "Production"
	before := catalogue.Addon{Name: "Extra seats", Description: "Existing", Version: 1, VersionName: version, IsDefault: true, MaxQuantity: &max}
	cmd := AddonChanges{Name: before.Name, Description: before.Description, VersionName: &version, MaxQuantity: &max}
	require.True(t, onlyUnsetDefault(before, cmd))
	for _, mutate := range []func(*AddonChanges){
		func(c *AddonChanges) { c.Name = "Expanded" },
		func(c *AddonChanges) { c.Description = "Changed" },
		func(c *AddonChanges) { c.VersionName = nil },
		func(c *AddonChanges) { c.MaxQuantity = nil },
		func(c *AddonChanges) { c.IsDefault = true },
	} {
		changed := cmd
		mutate(&changed)
		require.False(t, onlyUnsetDefault(before, changed))
	}
	before.IsDefault = false
	require.False(t, onlyUnsetDefault(before, cmd))
}
