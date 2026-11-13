package huma

import (
	"context"
	"net/http"
	"testing"

	humalib "github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humafiber"
	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The entries of a `security` list are alternatives, so an operation that needs
// several scopes must publish them in one entry: two entries would tell an
// integrator that any one of them is enough.
func TestRegisterScopedPublishesFurtherScopesAsOneRequirement(t *testing.T) {
	api := humafiber.New(fiber.New(), ConfigureSecurity(humalib.DefaultConfig("core", "1.0.0")))

	RegisterScoped(api, humalib.Operation{
		OperationID: "probe",
		Method:      http.MethodGet,
		Path:        "/probe",
		Security:    []map[string][]string{ScopeRequirement("read:instances", "read:licenses")},
	}, "read:customers", func(context.Context, *struct{}) (*struct{}, error) { return &struct{}{}, nil })

	security := api.OpenAPI().Paths["/probe"].Get.Security
	require.Len(t, security, 1)
	assert.Equal(t, []string{"read:customers", "read:instances", "read:licenses"}, security[0][BearerAuth])
}
