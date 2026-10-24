// Appendix A of the billing specification is the normative list of the error
// codes the billing routes answer: "a code listed here that the API never
// answers is a defect of the code, not of this appendix". This file checks the
// code against that list, statically, so a refusal cannot be renamed, dropped
// or retired back into the API without a test saying so.
package architecture_test

import (
	_ "embed"
	"fmt"
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"net/http"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"testing"

	"golang.org/x/tools/go/packages"
)

// appendixA is Appendix A as data: one "<status> <code> [tag]" line per code
// of A.1 and A.2, then one "retired <code>" line per code of A.4. Regenerate it
// from the specification when Appendix A changes; it is the list, not a copy
// of what the code does.
//
//go:embed testdata/appendix_a.txt
var appendixA string

const (
	apierrorsPkg = "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	sessionsPkg  = "github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
)

// codeArgs are the apierrors constructors that take a code: the index of the
// code argument, and the status the constructor answers with (0 when an
// argument decides it).
var codeArgs = map[string]struct {
	index  int
	status int
}{
	"NotFound":                      {0, http.StatusNotFound},
	"NotFoundf":                     {0, http.StatusNotFound},
	"Unauthorized":                  {0, http.StatusUnauthorized},
	"Forbidden":                     {0, http.StatusForbidden},
	"Conflict":                      {0, http.StatusConflict},
	"ConflictWithErrors":            {0, http.StatusConflict},
	"Validation":                    {0, http.StatusBadRequest},
	"ValidationWithDetails":         {0, http.StatusBadRequest},
	"UnprocessableEntity":           {0, http.StatusUnprocessableEntity},
	"UnprocessableEntityWithErrors": {0, http.StatusUnprocessableEntity},
	"UnprocessableEntityf":          {0, http.StatusUnprocessableEntity},
	"Internal":                      {0, http.StatusInternalServerError},
	"Unavailable":                   {0, http.StatusServiceUnavailable},
	"TooManyRequests":               {0, http.StatusTooManyRequests},
	"Wrap":                          {2, 0},
	"Wrapf":                         {2, 0},
	"NewProblem":                    {1, 0},
}

// kindStatus is the status of each apierrors.Kind, by constant name.
var kindStatus = map[string]int{
	"KindNotFound":        http.StatusNotFound,
	"KindUnauthorized":    http.StatusUnauthorized,
	"KindForbidden":       http.StatusForbidden,
	"KindConflict":        http.StatusConflict,
	"KindValidation":      http.StatusBadRequest,
	"KindUnprocessable":   http.StatusUnprocessableEntity,
	"KindInternal":        http.StatusInternalServerError,
	"KindUnavailable":     http.StatusServiceUnavailable,
	"KindTooManyRequests": http.StatusTooManyRequests,
}

var (
	codePattern   = regexp.MustCompile(`^[A-Z][A-Za-z0-9]*\.[A-Z][A-Za-z0-9]*$`)
	namePattern   = regexp.MustCompile(`^[A-Z][A-Za-z0-9]*$`)
	reasonPattern = regexp.MustCompile(`^\.[A-Z][A-Za-z0-9]*$`)
)

// codeInventory is what the production source can answer, as far as a static
// reading can tell.
type codeInventory struct {
	// full maps a code built from constants alone to the statuses it is
	// answered with (0: decided at run time) and where.
	full map[string]map[int][]string
	// reasons are the ".Reason" suffixes appended to an operation name the
	// source only knows at run time: a helper shared by several use cases
	// (operation+".NotActive"), or a parameter.
	reasons map[string][]string
	// names are the constant strings that can name a use case: the prefixes
	// of full codes and every constant spelled like one.
	names map[string]bool
	// renames are the prefix rewrites of the session mirrors
	// (sessions.Rename(err, core, operation)): from -> to.
	renames map[string]map[string]bool
}

// helper is a function that builds a code from one of its parameters: the
// code is before + the argument + after. invalid := func(reason, message
// string) error { ... operation+"."+reason ... } has a before known only at
// run time; catalogue.Lock(..., notFound string) takes the whole code.
type helper struct {
	param         int
	before, after string
	beforeKnown   bool
	status        int
}

func (h helper) emit(inv *codeInventory, arg, at string) {
	switch code := h.before + arg + h.after; {
	case h.beforeKnown && codePattern.MatchString(code):
		inv.addFull(code, h.status, at)
	case !h.beforeKnown && reasonPattern.MatchString(code):
		inv.reasons[code] = append(inv.reasons[code], at)
	}
}

func inventoryCodes(t *testing.T) *codeInventory {
	t.Helper()
	inv := &codeInventory{
		full:    map[string]map[int][]string{},
		reasons: map[string][]string{},
		names:   map[string]bool{},
		renames: map[string]map[string]bool{},
	}
	pkgs := loadModule(t)
	helpers := map[types.Object]helper{}
	// The first pass reads the constructors and finds the helpers; the next
	// ones follow a code through helpers that hand it on, until none is new.
	// Their calls are read once the set is complete.
	walkAll := func(pass int) {
		for _, pkg := range pkgs {
			for _, file := range pkg.Syntax {
				inv.walk(pkg, file, helpers, pass)
			}
		}
	}
	walkAll(0)
	for range 8 {
		before := len(helpers)
		walkAll(1)
		if len(helpers) == before {
			break
		}
	}
	walkAll(2)
	return inv
}

func (inv *codeInventory) addFull(code string, status int, at string) {
	if inv.full[code] == nil {
		inv.full[code] = map[int][]string{}
	}
	if !slices.Contains(inv.full[code][status], at) {
		inv.full[code][status] = append(inv.full[code][status], at)
	}
	inv.names[strings.SplitN(code, ".", 2)[0]] = true
}

func (inv *codeInventory) walk(pkg *packages.Package, file *ast.File, helpers map[types.Object]helper, pass int) {
	info := pkg.TypesInfo
	var stack []ast.Node
	ast.Inspect(file, func(n ast.Node) bool {
		if n == nil {
			stack = stack[:len(stack)-1]
			return true
		}
		stack = append(stack, n)
		at := func() string { return repoRelative(pkg.PkgPath) + ":" + strconv.Itoa(pkg.Fset.Position(n.Pos()).Line) }

		switch n := n.(type) {
		case *ast.ValueSpec:
			if pass == 0 {
				for _, name := range n.Names {
					if c, ok := info.Defs[name].(*types.Const); ok && c.Val().Kind() == constant.String {
						if v := constant.StringVal(c.Val()); namePattern.MatchString(v) {
							inv.names[v] = true
						}
					}
				}
			}
		case *ast.KeyValueExpr:
			// A code named in a literal is one a use case answers from a
			// field: WrongStateCode: "ArchiveAddon.NotPublished".
			if pass == 0 {
				if v, ok := stringConst(info, n.Value); ok && codePattern.MatchString(v) {
					inv.addFull(v, 0, at())
				}
			}
		case *ast.CompositeLit:
			// &apierrors.Error{Kind: ..., Code: ...}
			if pass != 0 || !isAPIErrorsType(info.TypeOf(n), "Error") {
				return true
			}
			status := 0
			var code ast.Expr
			for _, elt := range n.Elts {
				kv, ok := elt.(*ast.KeyValueExpr)
				if !ok {
					continue
				}
				switch key, _ := kv.Key.(*ast.Ident); {
				case key == nil:
				case key.Name == "Kind":
					status = kindOf(info, kv.Value)
				case key.Name == "Code":
					code = kv.Value
				}
			}
			if code != nil {
				inv.record(info, code, status, at(), stack, helpers)
			}
		case *ast.CallExpr:
			fn := calledFunc(info, n.Fun)
			if fn == nil {
				return true
			}
			if pass > 0 {
				h, ok := helpers[calledObject(info, n.Fun)]
				if !ok || h.param >= len(n.Args) {
					return true
				}
				arg := n.Args[h.param]
				if v, ok := stringConst(info, arg); ok {
					if pass == 2 {
						h.emit(inv, v, at())
					}
					return true
				}
				// The argument completes the code further: before + arg + after.
				operands := concatOperands(arg)
				if k, object, p := paramOperand(info, operands, stack); k >= 0 {
					outer, ok := concatParts(info, operands, k)
					if !ok {
						return true
					}
					if outer.beforeKnown {
						outer.before = h.before + outer.before
					}
					outer.beforeKnown = outer.beforeKnown && h.beforeKnown
					outer.after += h.after
					outer.param, outer.status = p, h.status
					if _, seen := helpers[object]; !seen {
						helpers[object] = outer
					}
				}
				return true
			}
			pkgPath := ""
			if fn.Pkg() != nil {
				pkgPath = fn.Pkg().Path()
			}
			switch {
			case fn.Pkg() == nil && takesCode(fn):
				// A constructor handed over as a value:
				// rename(kaitenerrors.Conflict, "BoundaryPending").
				inv.record(info, n.Args[0], 0, at(), stack, helpers)
			case pkgPath == apierrorsPkg:
				spec, ok := codeArgs[fn.Name()]
				if !ok || spec.index >= len(n.Args) {
					return true
				}
				status := spec.status
				switch fn.Name() {
				case "Wrap", "Wrapf":
					status = kindOf(info, n.Args[1])
				case "NewProblem":
					if v, ok := intConst(info, n.Args[0]); ok {
						status = v
					}
				}
				inv.record(info, n.Args[spec.index], status, at(), stack, helpers)
			case pkgPath == sessionsPkg && fn.Name() == "Rename" && len(n.Args) == 3:
				from, ok1 := stringConst(info, n.Args[1])
				to, ok2 := stringConst(info, n.Args[2])
				if ok1 && ok2 {
					if inv.renames[from] == nil {
						inv.renames[from] = map[string]bool{}
					}
					inv.renames[from][to] = true
				}
			case pkgPath == kaitenHumaPkg && fn.Name() == "SchemaCodes" && len(n.Args) == 1:
				if lit, ok := n.Args[0].(*ast.CompositeLit); ok {
					for _, elt := range lit.Elts {
						if kv, ok := elt.(*ast.KeyValueExpr); ok {
							inv.record(info, kv.Value, http.StatusUnprocessableEntity, at(), stack, helpers)
						}
					}
				}
			}
		}
		return true
	})
}

// record reads one code expression: a constant, an operation known only at
// run time followed by a constant ".Reason", or a helper's parameter.
func (inv *codeInventory) record(info *types.Info, expr ast.Expr, status int, at string, stack []ast.Node, helpers map[types.Object]helper) {
	if v, ok := stringConst(info, expr); ok {
		if codePattern.MatchString(v) {
			inv.addFull(v, status, at)
		}
		return
	}
	operands := concatOperands(expr)
	// An operation known only at run time, then a constant reason.
	if v, ok := stringConst(info, operands[len(operands)-1]); ok && reasonPattern.MatchString(v) {
		inv.reasons[v] = append(inv.reasons[v], at)
	}
	// A part of the code is a parameter of the enclosing function: its
	// callers name it.
	if k, object, p := paramOperand(info, operands, stack); k >= 0 {
		if h, ok := concatParts(info, operands, k); ok {
			h.param, h.status = p, status
			if _, seen := helpers[object]; !seen {
				helpers[object] = h
			}
		}
	}
}

// paramOperand is the last of operands that is a parameter of a function
// enclosing them: its index (-1 if none), the function's object and the
// parameter's index.
func paramOperand(info *types.Info, operands []ast.Expr, stack []ast.Node) (int, types.Object, int) {
	for k := len(operands) - 1; k >= 0; k-- {
		ident, ok := ast.Unparen(operands[k]).(*ast.Ident)
		if !ok {
			continue
		}
		param, ok := info.Uses[ident].(*types.Var)
		if !ok {
			continue
		}
		for i := len(stack) - 1; i >= 0; i-- {
			object, signature := enclosingFunc(info, stack, i)
			if object == nil || signature == nil {
				continue
			}
			for p := range signature.Params().Len() {
				if signature.Params().At(p) == param {
					return k, object, p
				}
			}
		}
		return -1, nil, 0
	}
	return -1, nil, 0
}

// concatParts folds the operands around operands[k] into a helper's before
// and after. after must be constant; before is either constant, or the
// constants that follow the last operand known only at run time.
func concatParts(info *types.Info, operands []ast.Expr, k int) (helper, bool) {
	h := helper{beforeKnown: true}
	for _, operand := range operands[k+1:] {
		v, ok := stringConst(info, operand)
		if !ok {
			return h, false
		}
		h.after += v
	}
	for _, operand := range operands[:k] {
		v, ok := stringConst(info, operand)
		if !ok {
			h.before, h.beforeKnown = "", false
			continue
		}
		h.before += v
	}
	return h, true
}

// enclosingFunc is the function stack[i] declares, if it is one: its object
// (the *types.Func of a declaration, the variable a literal is assigned to)
// and its signature.
func enclosingFunc(info *types.Info, stack []ast.Node, i int) (types.Object, *types.Signature) {
	switch fn := stack[i].(type) {
	case *ast.FuncDecl:
		object := info.Defs[fn.Name]
		if object == nil {
			return nil, nil
		}
		signature, _ := object.Type().(*types.Signature)
		return object, signature
	case *ast.FuncLit:
		signature, _ := info.TypeOf(fn).(*types.Signature)
		if i == 0 {
			return nil, signature
		}
		switch parent := stack[i-1].(type) {
		case *ast.AssignStmt:
			for j, rhs := range parent.Rhs {
				if rhs == fn && j < len(parent.Lhs) {
					if ident, ok := parent.Lhs[j].(*ast.Ident); ok {
						if object := info.ObjectOf(ident); object != nil {
							return object, signature
						}
					}
				}
			}
		case *ast.ValueSpec:
			for j, value := range parent.Values {
				if value == fn && j < len(parent.Names) {
					return info.Defs[parent.Names[j]], signature
				}
			}
		}
		return nil, signature
	}
	return nil, nil
}

func concatOperands(expr ast.Expr) []ast.Expr {
	switch e := ast.Unparen(expr).(type) {
	case *ast.BinaryExpr:
		if e.Op == token.ADD {
			return append(concatOperands(e.X), concatOperands(e.Y)...)
		}
	}
	return []ast.Expr{expr}
}

// stringConst is expr's constant string value.
func stringConst(info *types.Info, expr ast.Expr) (string, bool) {
	tv, ok := info.Types[expr]
	if !ok || tv.Value == nil || tv.Value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(tv.Value), true
}

func intConst(info *types.Info, expr ast.Expr) (int, bool) {
	tv, ok := info.Types[expr]
	if !ok || tv.Value == nil || tv.Value.Kind() != constant.Int {
		return 0, false
	}
	v, ok := constant.Int64Val(tv.Value)
	return int(v), ok
}

// kindOf is the status of an apierrors.Kind constant, 0 when the kind is a
// variable.
func kindOf(info *types.Info, expr ast.Expr) int {
	var ident *ast.Ident
	switch e := ast.Unparen(expr).(type) {
	case *ast.Ident:
		ident = e
	case *ast.SelectorExpr:
		ident = e.Sel
	default:
		return 0
	}
	if c, ok := info.Uses[ident].(*types.Const); ok && c.Pkg() != nil && c.Pkg().Path() == apierrorsPkg {
		return kindStatus[c.Name()]
	}
	return 0
}

func calledObject(info *types.Info, fun ast.Expr) types.Object {
	switch f := ast.Unparen(fun).(type) {
	case *ast.Ident:
		return info.Uses[f]
	case *ast.SelectorExpr:
		return info.Uses[f.Sel]
	case *ast.IndexExpr:
		return calledObject(info, f.X)
	}
	return nil
}

// calledFunc is the function or method fun names; for a variable holding a
// function it is a placeholder with that variable's name and no package.
func calledFunc(info *types.Info, fun ast.Expr) *types.Func {
	switch object := calledObject(info, fun).(type) {
	case *types.Func:
		return object
	case *types.Var:
		if signature, ok := object.Type().(*types.Signature); ok {
			return types.NewFunc(token.NoPos, nil, object.Name(), signature)
		}
	}
	return nil
}

// takesCode tells whether a function value has an apierrors constructor's
// shape: a string first, an *apierrors.Error back.
func takesCode(fn *types.Func) bool {
	signature, ok := fn.Type().(*types.Signature)
	if !ok || signature.Params().Len() == 0 || signature.Results().Len() != 1 {
		return false
	}
	first, ok := signature.Params().At(0).Type().(*types.Basic)
	return ok && first.Kind() == types.String && isAPIErrorsType(signature.Results().At(0).Type(), "Error")
}

func isAPIErrorsType(t types.Type, name string) bool {
	if p, ok := t.(*types.Pointer); ok {
		t = p.Elem()
	}
	named, ok := t.(*types.Named)
	return ok && named.Obj().Pkg() != nil && named.Obj().Pkg().Path() == apierrorsPkg && named.Obj().Name() == name
}

type appendixCode struct {
	status int
	code   string
	tag    string
}

func parseAppendixA(t *testing.T) (codes []appendixCode, retired []string) {
	t.Helper()
	for i, line := range strings.Split(appendixA, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if fields[0] == "retired" {
			retired = append(retired, fields[1])
			continue
		}
		status, err := strconv.Atoi(fields[0])
		if err != nil || len(fields) < 2 || !codePattern.MatchString(fields[1]) {
			t.Fatalf("testdata/appendix_a.txt:%d: %q is not \"<status> <code> [tag]\"", i+1, line)
		}
		c := appendixCode{status: status, code: fields[1]}
		if len(fields) > 2 {
			c.tag = fields[2]
		}
		codes = append(codes, c)
	}
	return codes, retired
}

// answered tells whether the source can answer code, and how it knows.
func (inv *codeInventory) answered(code string, seen map[string]bool) (string, bool) {
	if seen[code] {
		return "", false
	}
	seen[code] = true
	if _, ok := inv.full[code]; ok {
		return "constant", true
	}
	name, reason, _ := strings.Cut(code, ".")
	if inv.names[name] && len(inv.reasons["."+reason]) > 0 {
		return "operation known at run time, " + inv.reasons["."+reason][0], true
	}
	for from, tos := range inv.renames {
		if tos[name] {
			if how, ok := inv.answered(from+"."+reason, seen); ok {
				return "mirror of " + from + "." + reason + " (" + how + ")", true
			}
		}
	}
	return "", false
}

func TestAppendixACodesAreAnswered(t *testing.T) {
	codes, retired := parseAppendixA(t)
	inv := inventoryCodes(t)

	var missing []string
	for _, c := range codes {
		if c.tag == "V2" {
			continue
		}
		if _, ok := inv.answered(c.code, map[string]bool{}); !ok {
			missing = append(missing, fmt.Sprintf("%d %s", c.status, c.code))
		}
	}
	sort.Strings(missing)
	for _, m := range missing {
		t.Errorf("Appendix A lists %s, and no production code answers it", m)
	}

	declared := map[string]bool{}
	for _, c := range codes {
		declared[c.code] = true
	}
	for _, code := range retired {
		if declared[code] {
			continue // retired for one condition only, still answered for another
		}
		if at, ok := inv.full[code]; ok {
			t.Errorf("%s is retired by Appendix A (A.4) and still answered: %v", code, at)
		}
	}
}

func TestAppendixACodesAnswerTheirStatus(t *testing.T) {
	codes, _ := parseAppendixA(t)
	inv := inventoryCodes(t)
	for _, c := range codes {
		for status, at := range inv.full[c.code] {
			if status != 0 && status != c.status {
				t.Errorf("%s answers %d at %v; Appendix A says %d", c.code, status, at, c.status)
			}
		}
	}
}
