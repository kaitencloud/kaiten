package server

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
)

func TestInstanceLicenseTermContract(t *testing.T) {
	doc := newContractDocument(t)
	require.NotContains(t, doc.Paths, "/instances/{instanceSlug}/license-validation")
	schemas := doc.Components.Schemas.Map()
	require.NotContains(t, schemas, "LicenseValidation")
	raw, err := json.Marshal(doc)
	require.NoError(t, err)
	require.NotContains(t, string(raw), "getInstanceLicenseValidation")
	path := doc.Paths["/instances/{instanceSlug}"]
	require.NotNil(t, path)
	require.Equal(t, "getInstance", path.Get.OperationID)
	require.Equal(t, []string{"read:instances"}, path.Get.Security[0][kaitenhuma.BearerAuth])
	require.NotNil(t, path.Get.Responses["200"].Headers["Cache-Control"])
	for _, status := range []string{"401", "403", "404", "500"} {
		require.NotNil(t, path.Get.Responses[status])
	}
	instance := schemas["Instance"]
	term := instance.Properties["licenseTerm"]
	require.NotNil(t, term)
	require.True(t, term.ReadOnly)
	require.NotContains(t, instance.Required, "licenseTerm")
	require.NotContains(t, instance.Properties, "valid")
	termSchema := schemas["LicenseTerm"]
	require.NotNil(t, termSchema)
	require.Len(t, termSchema.Properties, 2)
	require.Equal(t, []any{"ACTIVE", "NOT_STARTED", "EXPIRED"}, termSchema.Properties["status"].Enum)
	require.Equal(t, "date-time", termSchema.Properties["evaluatedAt"].Format)
	require.NotContains(t, termSchema.Properties, "valid")
}
