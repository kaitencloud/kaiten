package common

import (
	"testing"

	"github.com/stretchr/testify/require"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestValidateConnectorName_NormalizesSupportedConnector(t *testing.T) {
	normalized, err := ValidateConnectorName("  KAITEN.INTEGRATION.CRM.ATTIO  ", "Connector.InvalidName")

	require.NoError(t, err)
	require.Equal(t, "kaiten.integration.crm.attio", normalized)
}

func TestValidateConnectorName_RejectsEmptyName(t *testing.T) {
	_, err := ValidateConnectorName("   ", "Connector.InvalidName")

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
	require.Equal(t, "Connector.InvalidName", kaitenerrors.GetCode(err))
}

func TestValidateConnectorName_RejectsNameWithoutKaitenPrefix(t *testing.T) {
	_, err := ValidateConnectorName("attio.integration.crm", "Connector.InvalidName")

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
	require.Equal(t, "Connector.InvalidName", kaitenerrors.GetCode(err))
}

func TestValidateConnectorName_RejectsInvalidNameFormat(t *testing.T) {
	_, err := ValidateConnectorName("kaiten.integration.crm.attio!", "Connector.InvalidName")

	require.Error(t, err)
	require.True(t, kaitenerrors.IsValidation(err))
	require.Equal(t, "Connector.InvalidName", kaitenerrors.GetCode(err))
}
