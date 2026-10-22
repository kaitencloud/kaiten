package huma

import (
	"context"
	"testing"

	humalib "github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/humatest"
	"github.com/stretchr/testify/assert"
)

func TestAuthOnlyRegistrarIsReservedForIntrospection(t *testing.T) {
	t.Parallel()
	for _, op := range []humalib.Operation{
		{Method: "POST", Path: "/authorization", OperationID: "GetAuthorization"},
		{Method: "GET", Path: "/customers", OperationID: "GetAuthorization"},
		{Method: "GET", Path: "/authorization", OperationID: "GetCustomers"},
	} {
		_, api := humatest.New(t)
		assert.Panics(t, func() {
			RegisterAuthorizationIntrospection(api, op, func(context.Context, *struct{}) (*struct{}, error) { return nil, nil })
		})
	}
}
