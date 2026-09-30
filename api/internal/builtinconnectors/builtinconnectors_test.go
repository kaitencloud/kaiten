package builtinconnectors_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/builtinconnectors"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
)

// recordingSurface is the credential-free surface as this package uses it: one
// method, recording what it was asked to register and failing on demand.
type recordingSurface struct {
	registered []builtinconnectors.Manifest
	fail       error
}

func (s *recordingSurface) RegisterConnector(
	_ context.Context, body builtinconnectors.Manifest,
) (*schema.Connector, error) {
	s.registered = append(s.registered, body)
	if s.fail != nil {
		return nil, s.fail
	}

	return &schema.Connector{Name: body.Name, Version: body.Version}, nil
}

func TestRegisterAllRegistersEveryManifest(t *testing.T) {
	t.Parallel()

	surface := &recordingSurface{}
	registrar := builtinconnectors.New(surface,
		builtinconnectors.Manifest{Name: "kaiten.integration.crm.attio", Version: "1.0.0"},
		builtinconnectors.Manifest{Name: "kaiten.integration.crm.other", Version: "2.0.0"},
	)

	require.NoError(t, registrar.RegisterAll(t.Context()))

	require.Len(t, surface.registered, 2)
	assert.Equal(t, "kaiten.integration.crm.attio", surface.registered[0].Name)
	assert.Equal(t, "kaiten.integration.crm.other", surface.registered[1].Name)
}

// Registration is an upsert on the name, so a restart is just another call. This is
// the property that lets startup register unconditionally rather than having to
// remember whether it already did.
func TestRegisterAllIsSafeToRepeat(t *testing.T) {
	t.Parallel()

	surface := &recordingSurface{}
	registrar := builtinconnectors.New(surface,
		builtinconnectors.Manifest{Name: "kaiten.integration.crm.attio", Version: "1.0.0"})

	require.NoError(t, registrar.RegisterAll(t.Context()))
	require.NoError(t, registrar.RegisterAll(t.Context()))

	assert.Len(t, surface.registered, 2, "both starts register; the use case is what makes it one row")
}

// A manifest that cannot be registered has to stop the process, because the
// deployment would otherwise come up refusing every attempt to configure that
// connector as though it did not exist. The error names which one failed.
func TestRegisterAllFailsNamingTheConnector(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("the database is unreachable")
	surface := &recordingSurface{fail: wantErr}
	registrar := builtinconnectors.New(surface,
		builtinconnectors.Manifest{Name: "kaiten.integration.crm.attio", Version: "1.0.0"})

	err := registrar.RegisterAll(t.Context())

	require.ErrorIs(t, err, wantErr)
	assert.ErrorContains(t, err, "kaiten.integration.crm.attio")
}

// A deployment that ships no built-in connectors is a real configuration -- the
// open-source binary with every connector disabled -- and must not be an error.
func TestRegisterAllWithNoManifestsIsANoOp(t *testing.T) {
	t.Parallel()

	surface := &recordingSurface{}

	require.NoError(t, builtinconnectors.New(surface).RegisterAll(t.Context()))
	assert.Empty(t, surface.registered)
}
