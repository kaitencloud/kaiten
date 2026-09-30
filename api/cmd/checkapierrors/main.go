// Command checkapierrors verifies that every Huma endpoint declares the HTTP
// error statuses it can actually return.
//
// The unit is the OPERATION, not the package: several use-case packages
// register two, and checking them together lets a sibling's fuller `Errors:`
// list mask the one that under-declares.
//
// For each operation it cross-checks the `Errors: []int{...}` list against the
// kaitenerrors.<Constructor>(...) calls in the operation's package, and against
// the scope the operation requires (401 from the transport with no identity,
// 403 from the facade with the wrong scope).
//
// An operation is recognised by the TYPE of the literal a call is handed --
// any `f(api, huma.Operation{...}, ...)` -- because a registration is the only
// thing that takes a huma.Operation. Matching on the callee's name made this
// fragile. Names still decide the scope gate, which is a different question.
//
// Constructor calls stay package-scoped: which of a package's two operations
// reaches a given kaitenerrors call is not decidable from the AST, and
// over-attributing is the safe direction.
//
// Only UNDER-declaration is flagged, which is what corrupts the generated
// contract and the downstream SDKs. Statuses propagating from other packages'
// services are not inferred, to keep it free of false positives.
//
// It always walks the whole tree: an endpoint nobody has touched in a year is
// exactly the one whose contract has drifted.
//
// Usage: checkapierrors [rootDir]   (default: internal/modules)
package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const (
	errorsPkgPath = "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	humaPkgPath   = "github.com/danielgtaylor/huma/v2"
)

// kaitenerrors terminal constructors -> the HTTP status they map to
// (see pkg/apierrors/errors.go HTTPStatus()). Wrap/Wrapf are
// intentionally excluded: their Kind is a caller-supplied argument, so the
// status is ambiguous.
var ctorStatus = map[string]int{
	"NotFound":              404,
	"NotFoundf":             404,
	"Unauthorized":          401,
	"Forbidden":             403,
	"Conflict":              409,
	"Validation":            400,
	"ValidationWithDetails": 400,
	"FromValidationError":   400,
	"UnprocessableEntity":   422,
	"UnprocessableEntityf":  422,
	"Internal":              500,
	"Unavailable":           503,
}

// net/http status constant names -> value (only the error statuses we care about)
var httpStatusValue = map[string]int{
	"StatusBadRequest":          400,
	"StatusUnauthorized":        401,
	"StatusForbidden":           403,
	"StatusNotFound":            404,
	"StatusConflict":            409,
	"StatusUnprocessableEntity": 422,
	"StatusTooManyRequests":     429,
	"StatusInternalServerError": 500,
	"StatusServiceUnavailable":  503,
}

var statusLabel = map[int]string{
	400: "400 BadRequest",
	401: "401 Unauthorized",
	403: "403 Forbidden",
	404: "404 NotFound",
	409: "409 Conflict",
	422: "422 UnprocessableEntity",
	429: "429 TooManyRequests",
	500: "500 InternalServerError",
	503: "503 ServiceUnavailable",
}

// operation is a single registration call - huma.Register or
// kaitenhuma.RegisterScoped.
type operation struct {
	id       string // OperationID, or "<method> <path>", or the position as a last resort
	position string // file:line of the registration call
	declared map[int]bool
	scoped   bool // behind a scope gate -> can answer 401 and 403
}

type pkgFacts struct {
	dir        string
	operations []*operation
	returned   map[int]bool // statuses the package's code can produce
}

func main() {
	root := "internal/modules"
	if args := os.Args[1:]; len(args) == 1 {
		root = args[0]
	}

	dirs := map[string][]string{} // dir -> .go files (non-test)
	//nolint:gosec // a developer tool walking a path its own operator typed; there is no request here to taint it
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		dir := filepath.Dir(path)
		dirs[dir] = append(dirs[dir], path)
		return nil
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "checkapierrors: walking %s: %v\n", root, err)
		os.Exit(2)
	}

	dirList := make([]string, 0, len(dirs))
	for dir := range dirs {
		dirList = append(dirList, dir)
	}
	sort.Strings(dirList)

	fset := token.NewFileSet()
	violations := 0
	operations := 0
	packages := 0

	for _, dir := range dirList {
		facts := analyzeDir(fset, dir, dirs[dir])
		if len(facts.operations) == 0 {
			continue
		}
		packages++
		operations += len(facts.operations)

		for _, op := range facts.operations {
			returned := operationReturns(facts, op)

			missing := make([]int, 0)
			for status := range returned {
				if !op.declared[status] {
					missing = append(missing, status)
				}
			}
			if len(missing) == 0 {
				continue
			}
			sort.Ints(missing)
			violations++
			labels := make([]string, len(missing))
			for i, s := range missing {
				labels[i] = statusLabel[s]
			}
			fmt.Fprintf(
				os.Stderr, "%s: %s\n  declares %s\n  but can return %s -> missing: %s\n\n",
				op.position,
				op.id,
				sortedLabels(op.declared),
				sortedLabels(returned),
				strings.Join(labels, ", "),
			)
		}
	}

	if violations > 0 {
		fmt.Fprintf(os.Stderr, "checkapierrors: %d operation(s) under-declare their error responses (of %d checked).\n", violations, operations)
		fmt.Fprintln(os.Stderr, "Add the missing http.Status* codes to the endpoint's Errors: []int{...} so the OpenAPI contract (and the SDKs) document them. The `generate-api-errors` skill can do this for you.")
		os.Exit(1)
	}
	fmt.Printf("checkapierrors: OK — %d operations in %d packages, all declared error responses match the errors they return.\n", operations, packages)
}

// operationReturns is what this one operation can answer: everything its
// package's code can produce, plus - when the operation is behind a scope
// gate - 403 (the scope is missing) and 401 (there is no identity at all).
func operationReturns(facts *pkgFacts, op *operation) map[int]bool {
	returned := make(map[int]bool, len(facts.returned)+2)
	for status := range facts.returned {
		returned[status] = true
	}
	if op.scoped {
		returned[401] = true
		returned[403] = true
	}
	return returned
}

func sortedLabels(set map[int]bool) string {
	codes := make([]int, 0, len(set))
	for c := range set {
		codes = append(codes, c)
	}
	sort.Ints(codes)
	parts := make([]string, len(codes))
	for i, c := range codes {
		parts[i] = statusLabel[c]
	}
	if len(parts) == 0 {
		return "(none)"
	}
	return strings.Join(parts, ", ")
}

func analyzeDir(fset *token.FileSet, dir string, files []string) *pkgFacts {
	facts := &pkgFacts{
		dir:      dir,
		returned: map[int]bool{},
	}

	for _, file := range files {
		f, err := parser.ParseFile(fset, file, nil, 0)
		if err != nil {
			fmt.Fprintf(os.Stderr, "checkapierrors: parse %s: %v\n", file, err)
			continue
		}
		analyzeFile(fset, f, importAlias(f, errorsPkgPath, "apierrors"), importAlias(f, humaPkgPath, "huma"), facts)
	}
	return facts
}

// importAlias returns the local name the file uses for an imported package, or
// "" if it doesn't import it.
func importAlias(f *ast.File, path, defaultName string) string {
	for _, imp := range f.Imports {
		if strings.Trim(imp.Path.Value, `"`) != path {
			continue
		}
		if imp.Name != nil {
			return imp.Name.Name
		}
		return defaultName
	}
	return ""
}

func analyzeFile(fset *token.FileSet, f *ast.File, errAlias, humaAlias string, facts *pkgFacts) {
	ast.Inspect(f, func(n ast.Node) bool {
		if call, ok := n.(*ast.CallExpr); ok {
			handleCall(fset, call, errAlias, humaAlias, facts)
		}
		return true
	})
}

func handleCall(fset *token.FileSet, call *ast.CallExpr, errAlias, humaAlias string, facts *pkgFacts) {
	// A registration - huma.Register(api, huma.Operation{...}, handler) or
	// kaitenhuma.RegisterScoped(api, huma.Operation{...}, scope, handler).
	// Identified by the second argument's type, not by the callee's name.
	if humaAlias != "" && len(call.Args) >= 2 {
		if lit := operationLiteral(call.Args[1], humaAlias); lit != nil {
			facts.operations = append(facts.operations, newOperation(fset, call, lit))
		}
	}

	// kaitenerrors.<Constructor>(...) -> the status it maps to.
	if errAlias == "" {
		return
	}
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return
	}
	if x, ok := sel.X.(*ast.Ident); ok && x.Name == errAlias {
		if status, ok := ctorStatus[sel.Sel.Name]; ok {
			facts.returned[status] = true
		}
	}
}

func newOperation(fset *token.FileSet, call *ast.CallExpr, lit *ast.CompositeLit) *operation {
	position := fset.Position(call.Pos())
	op := &operation{
		position: fmt.Sprintf("%s:%d", position.Filename, position.Line),
		declared: declaredErrors(lit),
		scoped:   hasScopeGate(calleeName(call)),
	}
	op.id = operationID(lit)
	if op.id == "" {
		op.id = "(unnamed operation)"
	}
	return op
}

// operationID names the operation for the report: its OperationID when it has
// one, otherwise "<METHOD> <path>" reconstructed from the literal.
func operationID(lit *ast.CompositeLit) string {
	var method, path string
	for key, value := range literalFields(lit) {
		switch key {
		case "OperationID":
			if id, ok := stringLiteral(value); ok {
				return id
			}
		case "Method":
			if sel, ok := value.(*ast.SelectorExpr); ok {
				method = strings.TrimPrefix(sel.Sel.Name, "Method")
			}
		case "Path":
			path, _ = stringLiteral(value)
		}
	}
	return strings.TrimSpace(method + " " + path)
}

// hasScopeGate reports whether the operation requires a scope, which makes 401
// and 403 reachable. Unlike the registration itself this IS a question about
// names -- but it is now a question about the registrar's name only, because
// there is one place a scope can be required from and it is not the operation
// literal.
//
// Each of these three registrars takes the required scope as an argument and the
// facade method behind the handler enforces it; a caller with no identity is
// refused 401 before the handler, a caller holding the wrong scope is refused 403
// by the facade. So the gate is knowable from the call and nothing needs to be
// inspected inside the literal -- an operation registered any other way requires
// no scope, and tests/architecture/entry_point_scope_test.go is what stops one
// from being registered any other way.
func hasScopeGate(callee string) bool {
	switch callee {
	case "RegisterScoped", "RegisterPlatform", "RegisterPlatformForOrganization":
		return true
	}
	return false
}

// calleeName is the function name a call invokes, qualified or not, with any
// explicit generic instantiation (Register[I, O](...)) unwrapped.
func calleeName(call *ast.CallExpr) string {
	fun := call.Fun
	for {
		switch e := fun.(type) {
		case *ast.ParenExpr:
			fun = e.X
		case *ast.IndexExpr:
			fun = e.X
		case *ast.IndexListExpr:
			fun = e.X
		case *ast.SelectorExpr:
			return e.Sel.Name
		case *ast.Ident:
			return e.Name
		default:
			return ""
		}
	}
}

// operationLiteral returns the `huma.Operation{...}` composite literal an
// argument carries, or nil if the argument is anything else.
func operationLiteral(arg ast.Expr, humaAlias string) *ast.CompositeLit {
	switch e := arg.(type) {
	case *ast.CompositeLit:
		if isOperationType(e.Type, humaAlias) {
			return e
		}
	case *ast.UnaryExpr: // &huma.Operation{...}
		if e.Op != token.AND {
			return nil
		}
		if lit, ok := e.X.(*ast.CompositeLit); ok && isOperationType(lit.Type, humaAlias) {
			return lit
		}
	}
	return nil
}

// isOperationType reports whether a composite literal's type is the selector
// huma.Operation, under whatever name the file imports huma as.
func isOperationType(expr ast.Expr, humaAlias string) bool {
	sel, ok := expr.(*ast.SelectorExpr)
	if !ok || sel.Sel.Name != "Operation" {
		return false
	}
	pkg, ok := sel.X.(*ast.Ident)
	return ok && pkg.Name == humaAlias
}

// literalFields yields the keyed fields of a composite literal.
func literalFields(lit *ast.CompositeLit) map[string]ast.Expr {
	out := make(map[string]ast.Expr, len(lit.Elts))
	for _, elt := range lit.Elts {
		kv, ok := elt.(*ast.KeyValueExpr)
		if !ok {
			continue
		}
		key, ok := kv.Key.(*ast.Ident)
		if !ok {
			continue
		}
		out[key.Name] = kv.Value
	}
	return out
}

func declaredErrors(lit *ast.CompositeLit) map[int]bool {
	out := map[int]bool{}
	value, ok := literalFields(lit)["Errors"]
	if !ok {
		return out
	}
	list, ok := value.(*ast.CompositeLit)
	if !ok {
		return out
	}
	for _, item := range list.Elts {
		if status, ok := statusFromExpr(item); ok {
			out[status] = true
		}
	}
	return out
}

func statusFromExpr(e ast.Expr) (int, bool) {
	sel, ok := e.(*ast.SelectorExpr)
	if !ok {
		return 0, false
	}
	if v, ok := httpStatusValue[sel.Sel.Name]; ok {
		return v, true
	}
	return 0, false
}

func stringLiteral(e ast.Expr) (string, bool) {
	lit, ok := e.(*ast.BasicLit)
	if !ok || lit.Kind != token.STRING {
		return "", false
	}
	s, err := strconv.Unquote(lit.Value)
	if err != nil {
		return "", false
	}
	return s, true
}
