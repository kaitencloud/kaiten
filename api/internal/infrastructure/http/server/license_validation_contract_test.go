package server

import (
	"testing"

	"github.com/stretchr/testify/require"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
)

func TestLicenseValidationContract(t *testing.T) {
	doc := newContractDocument(t)
	path := doc.Paths["/instances/{instanceSlug}/license-validation"]
	require.NotNil(t, path, "assigned license terms need a server-authoritative validation endpoint")
	require.NotNil(t, path.Get)
	require.Equal(t, "getInstanceLicenseValidation", path.Get.OperationID)
	require.Equal(t, []string{"read:instances"}, path.Get.Security[0][kaitenhuma.BearerAuth])
	require.NotNil(t, path.Get.Responses["200"])
}
