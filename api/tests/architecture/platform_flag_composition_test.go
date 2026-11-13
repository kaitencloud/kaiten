package architecture_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIntegrationInstancePoliciesUseTrustedPlatformFlags(t *testing.T) {
	file, err := parser.ParseFile(token.NewFileSet(), "../../internal/modules/integrations/integrations_module.go", nil, 0)
	require.NoError(t, err)
	wired := map[string]bool{"upsertintegration": false, "createinstance": false, "updateinstance": false}
	ast.Inspect(file, func(node ast.Node) bool {
		literal, ok := node.(*ast.CompositeLit)
		if !ok {
			return true
		}
		kind, ok := literal.Type.(*ast.SelectorExpr)
		if !ok || kind.Sel.Name != "Deps" {
			return true
		}
		owner, ok := kind.X.(*ast.Ident)
		if !ok {
			return true
		}
		if _, expected := wired[owner.Name]; !expected {
			return true
		}
		for _, element := range literal.Elts {
			field, ok := element.(*ast.KeyValueExpr)
			if !ok {
				continue
			}
			name, ok := field.Key.(*ast.Ident)
			if !ok || name.Name != "AIPolicy" {
				continue
			}
			ast.Inspect(field.Value, func(node ast.Node) bool {
				selector, ok := node.(*ast.SelectorExpr)
				if ok && selector.Sel.Name == "PlatformFlags" {
					service, ok := selector.X.(*ast.Ident)
					wired[owner.Name] = ok && service.Name == "svc"
				}
				return true
			})
		}
		return true
	})
	for owner, hasFlags := range wired {
		require.True(t, hasFlags, "%s must receive the trusted platform reader, not a zero or metering-derived policy", owner)
	}
}

func TestIntegrationUpdateResolvesBeforeItsTransaction(t *testing.T) {
	file, err := parser.ParseFile(token.NewFileSet(), "../../internal/modules/integrations/upsertintegration/handler.go", nil, 0)
	require.NoError(t, err)
	var operation *ast.FuncDecl
	for _, declaration := range file.Decls {
		if function, ok := declaration.(*ast.FuncDecl); ok && function.Name.Name == "UpsertInstance" {
			operation = function
		}
	}
	require.NotNil(t, operation)
	var resolutions, transactions, updates []*ast.CallExpr
	ast.Inspect(operation.Body, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		method, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		receiver, ok := method.X.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		switch receiver.Sel.Name {
		case "AIPolicy":
			if method.Sel.Name == "Resolve" {
				resolutions = append(resolutions, call)
			}
		case "Uow":
			if method.Sel.Name == "Transact" {
				transactions = append(transactions, call)
			}
		case "InstanceUpdater":
			require.Equal(t, "ExecuteWithinOperation", method.Sel.Name, "composed updates must not re-evaluate under the parent transaction")
			updates = append(updates, call)
		}
		return true
	})
	require.Len(t, resolutions, 1)
	require.Len(t, transactions, 1)
	require.Len(t, updates, 1)
	require.Less(t, resolutions[0].Pos(), transactions[0].Pos())
	require.Greater(t, updates[0].Pos(), transactions[0].Pos())
	require.Less(t, updates[0].End(), transactions[0].End())
}
