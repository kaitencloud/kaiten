package featureflag

import (
	"fmt"
	"slices"
	"sort"
	"strings"
	"unicode"

	"github.com/google/cel-go/cel"
	"github.com/google/cel-go/common/ast"
	celoperators "github.com/google/cel-go/common/operators"
)

/*
LintTargetingRule refuses a rule that cannot work, at the moment it is written.

A rule that references something the context does not carry does NOT fail loudly
at evaluation time: it fails to match, and the flag falls through to its default
variant. That is the right runtime behaviour — one mistyped rule must not break
a bulk evaluation — but it means a typo ships as "the feature is simply never
on". Rejecting it here is the only place the mistake can be stopped.

Four passes, because they catch different things:

  - A blank rule, which CEL rejects as a syntax error on every read — see
    ErrEmptyRule.

  - CEL's own parse and check, over the same environment the evaluator uses
    (lintEnv), so the two cannot disagree. Hosts send their own attributes
    (`user.cohort`, `device.os`) and those rules are legitimate, so the world
    cannot be closed — but a syntax error, or `license.slug > 5`, is caught.

  - A walk over the AST for the parts CEL cannot know: a map index is a runtime
    lookup, so `entitlements['sieges']` type-checks perfectly. The slugs are
    matched against the organization's actual catalogue, and what the rule
    does with each entitlement against the shape its type reads in: a field
    of a NUMBER, a bool for a BOOLEAN, an object for a CONFIG (see
    entitlementUse).

  - An estimate of the work the rule's own text commits it to, which
    evaluation would stop anyway — see costResult.

`knownEntitlements` may be nil, which skips the slug check and the
entitlement shape check that needs the slug's type — a caller without a
catalogue to hand still gets everything else.
*/
func LintTargetingRule(rule string, knownEntitlements []KnownEntitlement) error {
	return lintRule(rule, knownEntitlements).err
}

/*
LintTargetingRuleIssues is LintTargetingRule for an editor: the same four
passes, reporting every problem it found rather than the first, each positioned
where the author wrote it.

It exists so the console can show a rule's real verdict while it is being typed
instead of at save. That verdict has to come from here — the catalogue check
needs the organization's entitlements, which nothing running in a browser can
know — and it has to be the same pass, or the editor would say one thing and the
save another.
*/
func LintTargetingRuleIssues(rule string, knownEntitlements []KnownEntitlement) []TargetingRuleIssue {
	issues := lintRule(rule, knownEntitlements).issues
	if issues == nil {
		// A clean rule answers with an empty list, not with JSON null — the
		// difference is invisible here and a nullability case in every client.
		return []TargetingRuleIssue{}
	}

	return issues
}

/*
TargetingRuleIssue is one problem found in a rule, positioned so an editor can underline
exactly the offending name.

Line and Column are 1-based, which is what an editor expects — CEL numbers its
columns from 0, and that conversion happens here, once, rather than in every
caller holding the result. Zero means the problem has no position at all: a
blank rule, or an environment that could not be built.

EndLine and EndColumn close the range where one is known. They are zero for the
problems CEL reports itself, which come with a point and no extent; an editor
should then underline the word at the start position.
*/
type TargetingRuleIssue struct {
	Message   string `json:"message" doc:"What is wrong, in the same words the write path refuses it with"`
	Line      int    `json:"line" doc:"1-based line the problem starts on, or 0 when it has no position"`
	Column    int    `json:"column" doc:"1-based column the problem starts on, or 0 when it has no position"`
	EndLine   int    `json:"endLine,omitempty" doc:"1-based line the problem ends on, or 0 when only a point is known"`
	EndColumn int    `json:"endColumn,omitempty" doc:"1-based column just past the problem, or 0 when only a point is known"`
}

// lintResult is one rule's verdict in both the shapes it is needed in: the
// error the write path refuses with, carrying CEL's own annotated formatting,
// and the positioned issues an editor draws.
//
// Both come out of a single pass. Deriving one from the other would mean either
// re-parsing the rule or reducing the API's error to a bare message, and
// computing them separately would put two descriptions of the same verdict in
// the same file, free to drift — which is the mistake this package already
// paid for once, with the lint's hand-written field list against the structs.
type lintResult struct {
	err    error
	issues []TargetingRuleIssue
}

func lintRule(rule string, knownEntitlements []KnownEntitlement) lintResult {
	if strings.TrimSpace(rule) == "" {
		return unpositioned(ErrEmptyRule)
	}

	env, err := lintEnv(rule)
	if err != nil {
		return unpositioned(err)
	}

	parsed, issues := env.Parse(rule)
	if issues.Err() != nil {
		return lintResult{
			err:    fmt.Errorf("rule %q does not parse: %w", rule, issues.Err()),
			issues: celIssues(issues),
		}
	}

	checked, issues := env.Check(parsed)
	if issues.Err() != nil {
		return lintResult{
			err:    fmt.Errorf("rule %q is not valid: %w", rule, issues.Err()),
			issues: celIssues(issues),
		}
	}

	if result := namespaceResult(rule, parsed.NativeRep(), knownEntitlements); result.err != nil {
		return result
	}

	return costResult(env, rule, checked)
}

/*
costResult refuses a rule whose own text commits it to more work than
evaluation allows (celCostLimit).

Such a rule would save cleanly and then be stopped on every evaluation that
walks all of its iterations — every one where it matches, for an `.all()`, and
every one where it does not, for an `.exists()` — so its flag would fall through
to its other targetings, with the reason reported only at evaluation.

The estimate is CEL's own worst case, with every input sized at one element
(singleElementInputs). The inputs are what a rule cannot be judged on here: a
rule iterating over a host's list is legitimate, and whether it stays under the
limit depends on how long the host makes that list, which only an evaluation
knows. What is left is the work the author wrote: the literal lists, and how
deeply comprehensions nest over them. The worst case rather than the best,
because CEL's best case assumes every `&&` and `||` short-circuits, which puts
any comprehension nested inside `.all()` or `.exists()` at zero.

This refuses early; it does not protect. A rule that passes can still be
stopped at evaluation, when the context makes it iterate — the bounds in
EvaluateRule are what hold.
*/
func costResult(env *cel.Env, rule string, checked *cel.Ast) lintResult {
	// EstimateCost fails only on a malformed cost option, never because of the
	// rule; if it ever did, the rule would still be bounded at evaluation.
	estimate, err := env.EstimateCost(checked, singleElementInputs{})
	if err != nil || estimate.Max <= celCostLimit {
		return lintResult{}
	}

	return unpositioned(fmt.Errorf(
		"rule %q could cost up to %d to evaluate: %w", rule, estimate.Max, ErrRuleTooCostly,
	))
}

// unpositioned is a verdict about the rule as a whole rather than about
// anything written in it.
func unpositioned(err error) lintResult {
	return lintResult{err: err, issues: []TargetingRuleIssue{{Message: err.Error()}}}
}

// namespaceResult runs the walk over the server namespace and positions what it
// finds from the AST's own source info, so `__kaiten.license.slgu` underlines
// the misspelt field rather than the whole rule.
func namespaceResult(rule string, parsed *ast.AST, knownEntitlements []KnownEntitlement) lintResult {
	where, problem := lintServerNamespace(rule, parsed, knownEntitlements)
	if problem == nil {
		return lintResult{}
	}

	return lintResult{
		err:    problem,
		issues: []TargetingRuleIssue{spanIssue(problem.Error(), parsed.SourceInfo(), where)},
	}
}

// sourceSpan is the stretch of a rule an issue is about, in byte offsets. The
// zero value means the issue is about no particular stretch of it.
type sourceSpan struct {
	start int32
	stop  int32
}

func (s sourceSpan) known() bool { return s.stop > s.start }

// fieldSpan is where `.name` is written. The parser records only the dot for a
// select — the name it selects gets no node of its own — so the extent is
// measured from there, which is also why this cannot just read an offset range
// back off the id: past the dot, past any whitespace CEL allows after it,
// through the name.
//
// The rule arrives as runes because that is the unit CEL's offsets count in
// (its source is a rune buffer). Measuring in bytes would drift on any rule
// with a non-ASCII string literal before the mistake.
func fieldSpan(rule []rune, info *ast.SourceInfo, id int64, name string) sourceSpan {
	dot, ok := info.GetOffsetRange(id)
	if !ok {
		return sourceSpan{}
	}

	nameStart := int(dot.Start) + 1
	for nameStart < len(rule) && unicode.IsSpace(rule[nameStart]) {
		nameStart++
	}

	//nolint:gosec // an offset into a CEL rule; a rule 2GB long is not reachable through any endpoint that stores one
	return sourceSpan{start: dot.Start, stop: int32(nameStart + len([]rune(name)))}
}

// nodeSpan is where an expression is written, for a problem about something the
// parser did give a node of its own — the 'seats' in entitlements['seats'].
func nodeSpan(info *ast.SourceInfo, id int64) sourceSpan {
	offsets, ok := info.GetOffsetRange(id)
	if !ok {
		return sourceSpan{}
	}

	return sourceSpan{start: offsets.Start, stop: offsets.Stop}
}

// spanIssue converts a span into the 1-based range an editor draws.
func spanIssue(message string, info *ast.SourceInfo, where sourceSpan) TargetingRuleIssue {
	issue := TargetingRuleIssue{Message: message}
	if !where.known() {
		return issue
	}

	start, stop := info.GetLocationByOffset(where.start), info.GetLocationByOffset(where.stop)
	issue.Line, issue.Column = start.Line(), start.Column()+1
	issue.EndLine, issue.EndColumn = stop.Line(), stop.Column()+1

	return issue
}

// celIssues converts everything CEL objected to, keeping its own message: it
// names the identifier and the expected type more precisely than a rewording
// would. CEL reports a point rather than an extent, so these carry no end.
func celIssues(issues *cel.Issues) []TargetingRuleIssue {
	errs := issues.Errors()

	converted := make([]TargetingRuleIssue, 0, len(errs))
	for _, err := range errs {
		issue := TargetingRuleIssue{Message: err.Message}
		// An issue CEL could not place yields common.NoLocation, whose line is
		// -1 — reported as "no position" rather than passed on as a negative
		// line number an editor would choke on.
		if err.Location.Line() > 0 {
			issue.Line, issue.Column = err.Location.Line(), err.Location.Column()+1
		}
		converted = append(converted, issue)
	}

	return converted
}

// lintEnv is the runtime environment over the roots the rule reads, so the
// linter and the evaluator type every identifier identically — a rule that
// lints clean cannot then fail its type check at evaluation.
//
// Built fresh rather than through celEnv's cache, on purpose. The cache is
// bounded, never evicts, and is shared with the evaluation hot path — and
// these keys are derived from rule text: with the lint now running on every
// keystroke of every editor, each half-typed prefix would deposit an
// environment for a root set no rule will ever have again, until the cap is
// reached and the shapes evaluation actually needs are the ones locked out.
func lintEnv(rule string) (*cel.Env, error) {
	return newCELEnv(lintRoots(rule))
}

// lintRoots is every identifier the rule reads, plus the two the server always
// declares.
func lintRoots(rule string) []string {
	roots := []string{FactsRoot, targetingKeyRoot}

	// Roots are discovered from the rule itself: parsing without declarations
	// still yields an AST, and anything not ours becomes dyn. This also covers
	// a rule that references the caller-input `kaiten` namespace (ofrep.KaitenInput)
	// — not a legitimate thing to target on, but harmless: it's just treated as
	// an arbitrary host attribute, same as any other unknown root.
	bare, err := celEnv(envKey(nil), nil)
	if err != nil {
		return roots
	}

	if parsed, issues := bare.Parse(rule); issues.Err() == nil {
		for _, root := range rootIdentifiers(parsed.NativeRep().Expr()) {
			if root == FactsRoot || root == targetingKeyRoot {
				continue
			}
			roots = append(roots, root)
		}
	}
	sort.Strings(roots)

	return roots
}

func rootIdentifiers(expr ast.Expr) []string {
	seen := map[string]bool{}
	walk(expr, func(e ast.Expr) {
		if e.Kind() == ast.IdentKind {
			seen[e.AsIdent()] = true
		}
	})

	roots := make([]string, 0, len(seen))
	for name := range seen {
		roots = append(roots, name)
	}
	sort.Strings(roots)

	return roots
}

// fieldRoot reports whether expr is `__kaiten.<name>` — a select directly off
// the reserved facts root — and returns that sub-root's name.
func fieldRoot(expr ast.Expr) (string, bool) {
	if expr.Kind() != ast.SelectKind {
		return "", false
	}
	sel := expr.AsSelect()
	if sel.Operand().Kind() != ast.IdentKind || sel.Operand().AsIdent() != FactsRoot {
		return "", false
	}
	return sel.FieldName(), true
}

// lintServerNamespace reports the first problem it finds under FactsRoot, and
// where in the rule it is written so the caller can underline it.
func lintServerNamespace(rule string, parsed *ast.AST, knownEntitlements []KnownEntitlement) (sourceSpan, error) {
	var problem error
	var where sourceSpan

	info := parsed.SourceInfo()
	runes := []rune(rule)
	parents := parentsOf(parsed.Expr())
	knownFields := map[string][]string{
		LicenseRoot:        licenseFields,
		InstanceRoot:       instanceFields,
		CustomerRoot:       customerFields,
		DeploymentZoneRoot: deploymentZoneFields,
	}

	walk(parsed.Expr(), func(e ast.Expr) {
		if problem != nil {
			return
		}

		// fail records a problem and where it is written. A nil error is no
		// problem at all, so the checks that may or may not object can hand
		// their result straight over.
		fail := func(err error, at sourceSpan) {
			if err == nil {
				return
			}
			problem, where = err, at
		}

		// One entitlement, `__kaiten.entitlements['x']` or
		// `__kaiten.entitlements.x`: its slug is checked against the
		// catalogue, and what the rule does with it against the shape its
		// type reads in.
		if slug, at, ok := entitlementAccess(runes, info, e); ok {
			if err := unknownEntitlement(rule, slug, knownEntitlements); err != nil {
				fail(err, at)
				return
			}
			span, err := entitlementUse(rule, runes, info, e, parents[e.ID()], slug, at, knownEntitlements)
			fail(err, span)
			return
		}

		if e.Kind() != ast.SelectKind {
			return
		}

		// failField is fail for a problem about the name this select reads.
		failField := func(err error, name string) {
			fail(err, fieldSpan(runes, info, e.ID(), name))
		}

		sel := e.AsSelect()

		// `__kaiten.<name>` itself. The namespace is reserved and entirely
		// server-written, so unlike everywhere else in a rule there is no open
		// world here: a name that is not one of the sub-roots cannot exist,
		// under any context, ever. The checks below only judge fields *under* a
		// known sub-root, so without this `__kaiten.customers` (for `customer`)
		// would save cleanly and never match.
		if name, ok := fieldRoot(e); ok {
			if !slices.Contains(factsSubroots, name) {
				failField(fmt.Errorf(
					"rule %q reads %s.%s, which does not exist — available: %s",
					rule, FactsRoot, name, strings.Join(factsSubroots, ", "),
				), name)
			}
			return
		}

		// `__kaiten.<subroot>.<field>` — only the top level under each
		// subroot is checked; metadata is a dynamic map, so
		// `__kaiten.instance.metadata.demo` is left alone below "metadata".
		// Entitlements were answered above.
		if subroot, ok := fieldRoot(sel.Operand()); ok {
			fields, known := knownFields[subroot]
			if !known {
				return // not one of our subroots — e.g. a computed/unknown key, leave it alone
			}
			if !slices.Contains(fields, sel.FieldName()) {
				failField(fmt.Errorf(
					"rule %q reads %s.%s.%s, which does not exist — available: %s",
					rule, FactsRoot, subroot, sel.FieldName(), strings.Join(fields, ", "),
				), sel.FieldName())
			}
		}
	})

	return where, problem
}

// unknownEntitlement reports a slug the organization does not have. A nil
// catalogue means the caller has none to check against, which skips only this.
func unknownEntitlement(rule, slug string, knownEntitlements []KnownEntitlement) error {
	if knownEntitlements == nil {
		return nil
	}
	if _, ok := entitlementTypeOf(slug, knownEntitlements); ok {
		return nil
	}

	return fmt.Errorf(
		"rule %q targets the entitlement %q, which this organization does not have",
		rule, slug,
	)
}

func entitlementTypeOf(slug string, knownEntitlements []KnownEntitlement) (EntitlementType, bool) {
	for _, known := range knownEntitlements {
		if known.Slug == slug {
			return known.Type, true
		}
	}
	return "", false
}

/*
entitlementUse judges what a rule does with one entitlement, against the shape
its type reads in (see EntitlementType): a NUMBER is an object whose fields are
EntitlementFact's, a BOOLEAN is a bool, a CONFIG is an object the license
fills.

CEL cannot do this itself: the entitlements map holds a different shape under
each key, so to its checker every entry is dyn, and `__kaiten.entitlements['sso']
.limit` type-checks as cleanly as it fails at evaluation — by not matching,
which ships as a feature that is silently never on.

Only what is certain to fail is refused. A presence test (`has(...)`) is fine
on any shape, and a slug the catalogue does not type — no catalogue at all —
is left alone, since nothing says which shape it reads in.
*/
func entitlementUse(
	rule string, runes []rune, info *ast.SourceInfo,
	entry, parent ast.Expr, slug string, at sourceSpan,
	knownEntitlements []KnownEntitlement,
) (sourceSpan, error) {
	typ, typed := entitlementTypeOf(slug, knownEntitlements)
	if !typed || isPresenceTest(entry) {
		return sourceSpan{}, nil
	}

	field, fieldAt, isField := fieldRead(runes, info, entry, parent)
	operator, other := operatorOver(entry, parent)

	switch typ {
	case EntitlementNumber:
		if isField {
			if field == "" || slices.Contains(entitlementFields, field) {
				return sourceSpan{}, nil
			}
			return fieldAt, fmt.Errorf(
				"rule %q reads .%s on the NUMBER entitlement %q, which does not exist — available: %s",
				rule, field, slug, strings.Join(entitlementFields, ", "),
			)
		}
		if operator == celoperators.In {
			return sourceSpan{}, nil
		}
		return at, fmt.Errorf(
			"rule %q reads the NUMBER entitlement %q as a value — read one of its fields: %s",
			rule, slug, strings.Join(entitlementFields, ", "),
		)

	case EntitlementBoolean:
		if isField || operator == celoperators.In {
			if fieldAt == (sourceSpan{}) {
				fieldAt = at
			}
			return fieldAt, fmt.Errorf(
				"rule %q reads a field of the BOOLEAN entitlement %q, which is the bool the license grants and has none — compare it directly: %s['%s'] == true",
				rule, slug, FactsRoot+"."+EntitlementsRoot, slug,
			)
		}
		if slices.Contains(arithmeticOperators, operator) {
			return at, fmt.Errorf(
				"rule %q uses the BOOLEAN entitlement %q as a number — it is true or false: %s['%s'] == true",
				rule, slug, FactsRoot+"."+EntitlementsRoot, slug,
			)
		}
		if literal, ok := literalValue(other); ok && slices.Contains(equalityOperators, operator) {
			if _, isBool := literal.(bool); !isBool {
				return at, fmt.Errorf(
					"rule %q compares the BOOLEAN entitlement %q with %v — compare it with true or false",
					rule, slug, literal,
				)
			}
		}

	case EntitlementConfig:
		if slices.Contains(arithmeticOperators, operator) {
			return at, fmt.Errorf(
				"rule %q uses the CONFIG entitlement %q as a number — it is an object: read one of its keys, e.g. %s['%s'].<key>",
				rule, slug, FactsRoot+"."+EntitlementsRoot, slug,
			)
		}
		if literal, ok := literalValue(other); ok && slices.Contains(equalityOperators, operator) {
			return at, fmt.Errorf(
				"rule %q compares the CONFIG entitlement %q with %v — it is an object: compare one of its keys, e.g. %s['%s'].<key>",
				rule, slug, literal, FactsRoot+"."+EntitlementsRoot, slug,
			)
		}
	}

	return sourceSpan{}, nil
}

// The operators that only make sense on a number, and the ones that compare
// two values, as CEL names them in the AST.
var (
	arithmeticOperators = []string{
		celoperators.Less, celoperators.LessEquals,
		celoperators.Greater, celoperators.GreaterEquals,
		celoperators.Add, celoperators.Subtract, celoperators.Multiply,
		celoperators.Divide, celoperators.Modulo, celoperators.Negate,
	}
	equalityOperators = []string{celoperators.Equals, celoperators.NotEquals}
)

// isPresenceTest reports `has(__kaiten.entitlements.x)`, which asks whether the
// entry exists and is fine whatever its shape.
func isPresenceTest(entry ast.Expr) bool {
	return entry.Kind() == ast.SelectKind && entry.AsSelect().IsTestOnly()
}

// fieldRead reports the field a rule reads on entry, in either form CEL
// accepts: `entry.field` and `entry['field']`. A computed key reads as a field
// with no name — something is read, nobody can say what.
func fieldRead(runes []rune, info *ast.SourceInfo, entry, parent ast.Expr) (string, sourceSpan, bool) {
	if parent == nil {
		return "", sourceSpan{}, false
	}

	switch parent.Kind() {
	case ast.SelectKind:
		sel := parent.AsSelect()
		if sel.Operand().ID() != entry.ID() {
			return "", sourceSpan{}, false
		}
		return sel.FieldName(), fieldSpan(runes, info, parent.ID(), sel.FieldName()), true
	case ast.CallKind:
		call := parent.AsCall()
		if call.FunctionName() != celoperators.Index || len(call.Args()) != 2 || call.Args()[0].ID() != entry.ID() {
			return "", sourceSpan{}, false
		}
		key := call.Args()[1]
		if name, ok := literalValue(key); ok {
			if name, ok := name.(string); ok {
				return name, nodeSpan(info, key.ID()), true
			}
		}
		return "", sourceSpan{}, true
	}

	return "", sourceSpan{}, false
}

// operatorOver reports the call entry is an operand of, and the operand on the
// other side when it has exactly two. An entry that is not an operand of any
// call reports no operator.
func operatorOver(entry, parent ast.Expr) (string, ast.Expr) {
	if parent == nil || parent.Kind() != ast.CallKind {
		return "", nil
	}

	call := parent.AsCall()
	args := call.Args()
	if len(args) == 2 {
		if args[0].ID() == entry.ID() {
			return call.FunctionName(), args[1]
		}
		return call.FunctionName(), args[0]
	}
	return call.FunctionName(), nil
}

// literalValue is the Go value of a literal, and nothing for anything else.
func literalValue(expr ast.Expr) (any, bool) {
	if expr == nil || expr.Kind() != ast.LiteralKind {
		return nil, false
	}
	return expr.AsLiteral().Value(), true
}

// entitlementAccess reports the slug an entitlement is read under, and where
// that slug is written, in either form CEL accepts for a map:
// `__kaiten.entitlements['x']` and `__kaiten.entitlements.x` mean the same
// thing at evaluation, so the linter has to see both. Only the indexed one was
// checked, which left dot access as a way to reach an entitlement — real or
// misspelt — with nothing verifying the slug or the field below it.
//
// The two forms are anchored differently: an indexed key is a literal with a
// node of its own, whereas a dotted one is a name hanging off a select. Each
// branch measures its own span, so neither has to know how the other is
// written.
func entitlementAccess(rule []rune, info *ast.SourceInfo, expr ast.Expr) (string, sourceSpan, bool) {
	if expr.Kind() != ast.SelectKind {
		return entitlementIndex(info, expr)
	}

	sel := expr.AsSelect()
	if subroot, ok := fieldRoot(sel.Operand()); ok && subroot == EntitlementsRoot {
		return sel.FieldName(), fieldSpan(rule, info, expr.ID(), sel.FieldName()), true
	}

	return "", sourceSpan{}, false
}

// entitlementIndex reports the literal slug in `__kaiten.entitlements['x']`.
// A computed index is left alone: it cannot be checked, and refusing it
// would forbid a legitimate rule.
func entitlementIndex(info *ast.SourceInfo, expr ast.Expr) (string, sourceSpan, bool) {
	if expr.Kind() != ast.CallKind {
		return "", sourceSpan{}, false
	}

	call := expr.AsCall()
	if call.FunctionName() != celoperators.Index || len(call.Args()) != 2 {
		return "", sourceSpan{}, false
	}

	target := call.Args()[0]
	subroot, ok := fieldRoot(target)
	if !ok || subroot != EntitlementsRoot {
		return "", sourceSpan{}, false
	}

	key := call.Args()[1]
	if key.Kind() != ast.LiteralKind {
		return "", sourceSpan{}, false
	}

	slug, ok := key.AsLiteral().Value().(string)
	if !ok {
		return "", sourceSpan{}, false
	}

	return slug, nodeSpan(info, key.ID()), true
}

func walk(expr ast.Expr, visit func(ast.Expr)) {
	if expr == nil {
		return
	}

	visit(expr)

	for _, child := range children(expr) {
		walk(child, visit)
	}
}

// parentsOf maps every node of a rule to the node it is an operand of, which
// is what tells an entitlement read as a value from one read for a field.
func parentsOf(root ast.Expr) map[int64]ast.Expr {
	parents := map[int64]ast.Expr{}

	walk(root, func(e ast.Expr) {
		for _, child := range children(e) {
			if child != nil {
				parents[child.ID()] = e
			}
		}
	})

	return parents
}

func children(expr ast.Expr) []ast.Expr {
	switch expr.Kind() {
	case ast.CallKind:
		call := expr.AsCall()
		var nodes []ast.Expr
		if call.IsMemberFunction() {
			nodes = append(nodes, call.Target())
		}
		return append(nodes, call.Args()...)
	case ast.SelectKind:
		return []ast.Expr{expr.AsSelect().Operand()}
	case ast.ListKind:
		return expr.AsList().Elements()
	case ast.MapKind:
		var nodes []ast.Expr
		for _, entry := range expr.AsMap().Entries() {
			nodes = append(nodes, entry.AsMapEntry().Key(), entry.AsMapEntry().Value())
		}
		return nodes
	case ast.ComprehensionKind:
		comp := expr.AsComprehension()
		return []ast.Expr{comp.IterRange(), comp.LoopCondition(), comp.LoopStep(), comp.Result()}
	}

	return nil
}
