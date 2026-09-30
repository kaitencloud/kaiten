package getconnectors

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registry"
)

type stubLister struct {
	connectors []registry.Connector
}

func (s *stubLister) List(context.Context) ([]registry.Connector, error) {
	return s.connectors, nil
}

// The same field getconnector carries, for the same reason: the catalogue is how a
// client discovers what it is allowed to activate, and every entry in it read as
// ungated.
func TestExecute_CarriesTheEntitlementSlug(t *testing.T) {
	slug := "connector-attio"
	h := NewUseCase(&stubLister{connectors: []registry.Connector{
		{Name: "kaiten.integration.crm.attio", Version: "1.0.0", EntitlementSlug: &slug},
		{Name: "kaiten.integration.crm.ungated", Version: "1.0.0"},
	}})

	result, err := h.Execute(context.Background())

	require.NoError(t, err)
	require.Len(t, result, 2)
	require.NotNil(t, result[0].EntitlementSlug)
	require.Equal(t, slug, *result[0].EntitlementSlug)
	require.Nil(t, result[1].EntitlementSlug)
}
