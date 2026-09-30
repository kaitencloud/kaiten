package featureflag

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/cel-go/cel"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
)

// targetingKeyRoot is the one attribute every evaluation context carries, and
// the only identifier besides FactsRoot whose type the server knows.
const targetingKeyRoot = "targetingKey"

// ErrEmptyRule refuses a blank targeting rule at the moment it is written.
// CEL rejects "" as a syntax error, so a blank rule is a rule that can never
// match — it was accepted only because both the write-time syntax check and
// the linter returned early for it, and it then failed on every single read.
// A rule that is meant to always match is written `true`.
var ErrEmptyRule = errors.New("targeting rule is empty — write `true` for a rule that always matches")

// Engine compiles and runs CEL targeting rules against one evaluation
// context. Built once per flag evaluation and reused across every targeting
// rule on that flag; the environment and the compiled rules themselves are
// cached process-wide, since neither depends on anything but the context
// shape and the rule text.
type Engine struct {
	env    *cel.Env
	envKey string
	ctx    openfeature.EvaluationContext
}

// NewEngine builds a CEL environment whose variable declarations are derived
// from ctx, so a rule may reference any attribute the caller supplied.
func NewEngine(ctx openfeature.EvaluationContext) (*Engine, error) {
	roots := declaredRoots(ctx)
	key := envKey(roots)

	env, err := celEnv(key, roots)
	if err != nil {
		return nil, err
	}

	return &Engine{env: env, envKey: key, ctx: ctx}, nil
}

// EvaluateRule parses, checks and runs rule against the engine's evaluation
// context, returning whether it matched.
//
// The run is bounded by celCostLimit and, inside comprehensions, by
// celEvalTimeout and by ctx. A stopped rule fails with an EvalError like any
// other rule that could not run, which every caller already reads as "does not
// match".
func (e *Engine) EvaluateRule(ctx context.Context, rule string) (bool, error) {
	return e.evaluateWithin(ctx, rule, celEvalTimeout)
}

// evaluateWithin is EvaluateRule under a deadline of timeout. Nothing but a
// test passes anything other than celEvalTimeout: no rule known to stay under
// the cost limit runs long enough to reach it.
func (e *Engine) evaluateWithin(ctx context.Context, rule string, timeout time.Duration) (bool, error) {
	program, err := e.compile(rule)
	if err != nil {
		return false, err
	}

	ctx, cancel := context.WithTimeoutCause(ctx, timeout, ErrRuleTimedOut)
	defer cancel()

	out, _, err := program.ContextEval(ctx, e.ctx.ToMap())
	if err != nil {
		return false, &EvalError{Rule: rule, Err: stoppedBecause(err)}
	}

	match, ok := out.Value().(bool)
	if !ok {
		return false, &NonBoolResultError{Rule: rule}
	}
	return match, nil
}

// ValidateRule checks that rule parses under this engine's environment,
// without running it.
func (e *Engine) ValidateRule(rule string) error {
	_, iss := e.env.Parse(rule)
	if iss.Err() != nil {
		return fmt.Errorf("CEL parsing error: %v", iss.Err())
	}
	return nil
}

// compile returns rule's compiled program under this engine's environment,
// reusing the result of every earlier compilation of the same rule under the
// same context shape.
func (e *Engine) compile(rule string) (cel.Program, error) {
	key := e.envKey + celKeySeparator + rule
	if cached, ok := celProgramCache.load(key); ok {
		return cached.program, cached.err
	}

	compiled := compileRule(e.env, rule)
	celProgramCache.store(key, compiled)

	return compiled.program, compiled.err
}

// ValidateRule checks that rule is syntactically valid CEL, independent of
// any evaluation context. Callers that only need a one-shot syntax check
// (e.g. validating a rule string at the moment it's authored) can use this
// instead of building an Engine themselves.
func ValidateRule(rule string) error {
	if strings.TrimSpace(rule) == "" {
		return ErrEmptyRule
	}

	engine, err := NewEngine(openfeature.EvaluationContext{})
	if err != nil {
		return err
	}

	return engine.ValidateRule(rule)
}

// declaredRoots is every identifier an evaluation context makes available,
// sorted so the same context shape always yields the same environment.
func declaredRoots(ctx openfeature.EvaluationContext) []string {
	data := ctx.ToMap()

	roots := make([]string, 0, len(data))
	for name := range data {
		roots = append(roots, name)
	}
	sort.Strings(roots)

	return roots
}

/*
celVariable gives a root the ONE type model the linter and the runtime share.

Only the two identifiers the server owns are typed. Everything else is a host
attribute and stays dyn, because typing it from whatever value happened to be
in the context is exactly what let a rule lint clean and then fail at
evaluation: the linter sees a rule and never a value, so the two environments
disagreed on every attribute a caller sends.

Numbers were the sharpest edge. Every one of them was declared double, so the
obvious `seats > 10` failed the type check and `10.0` was required — an opaque
CEL message for a rule that reads correctly. cel.CrossTypeNumericComparisons,
enabled in celEnv, is the other half of that fix: it makes the comparison
dispatch at runtime too, where the value is a JSON float and the literal is an
int.
*/
func celVariable(root string) cel.EnvOption {
	switch root {
	case FactsRoot:
		return cel.Variable(FactsRoot, cel.MapType(cel.StringType, cel.DynType))
	case targetingKeyRoot:
		return cel.Variable(targetingKeyRoot, cel.StringType)
	default:
		return cel.Variable(root, cel.DynType)
	}
}

// celEnv returns the environment declaring exactly roots, building it at most
// once per distinct root set. key must be envKey(roots).
//
// Only the evaluation path should come through here: its keys are context
// shapes, of which a deployment has a handful. The lint builds uncached
// (newCELEnv directly) because its keys are derived from rule text as it is
// typed — see lintEnv.
func celEnv(key string, roots []string) (*cel.Env, error) {
	if cached, ok := celEnvCache.load(key); ok {
		return cached, nil
	}

	env, err := newCELEnv(roots)
	if err != nil {
		return nil, err
	}
	celEnvCache.store(key, env)

	return env, nil
}

// newCELEnv builds the environment declaring exactly roots, every time it is
// called. The caching decision belongs to the caller: what makes a key safe to
// hold forever is where it came from, which only the caller knows.
func newCELEnv(roots []string) (*cel.Env, error) {
	opts := make([]cel.EnvOption, 0, len(roots)+1)
	opts = append(opts, cel.CrossTypeNumericComparisons(true))
	for _, root := range roots {
		opts = append(opts, celVariable(root))
	}

	env, err := cel.NewEnv(opts...)
	if err != nil {
		return nil, fmt.Errorf("CEL initialization error: %v", err)
	}

	return env, nil
}

// envKey identifies an environment by the sorted roots it declares. CEL
// identifiers cannot contain the separator, so the join is unambiguous.
func envKey(roots []string) string {
	return strings.Join(roots, celKeySeparator)
}

func compileRule(env *cel.Env, rule string) compiledRule {
	ast, iss := env.Parse(rule)
	if iss.Err() != nil {
		return compiledRule{err: &ParseError{Rule: rule, Err: iss.Err()}}
	}

	checked, iss := env.Check(ast)
	if iss.Err() != nil {
		return compiledRule{err: &CheckError{Rule: rule, Err: iss.Err()}}
	}

	program, err := env.Program(checked,
		cel.CostLimit(celCostLimit),
		cel.InterruptCheckFrequency(celInterruptCheckFrequency),
		cel.EvalOptions(cel.OptOptimize),
	)
	if err != nil {
		return compiledRule{err: &CompileError{Rule: rule, Err: err}}
	}

	return compiledRule{program: program, err: nil}
}

// compiledRule is a rule's compilation outcome: the program, or the error that
// stopped it. Failures are cached alongside successes — a rule that does not
// compile will not compile on the next request either, and re-deriving the
// same failure per evaluation is the same waste as re-deriving the same
// success, on a flag whose broken rule is hit by every caller.
type compiledRule struct {
	program cel.Program
	err     error
}

const (
	// celKeySeparator joins the parts of a cache key. NUL cannot appear in a
	// CEL identifier, so a joined key cannot be forged by naming a root.
	celKeySeparator = "\x00"

	// celCacheLimit bounds both caches. Half of each key is caller-controlled
	// — the context shape comes off the request body — so an unbounded map
	// keyed on it is a memory-growth vector. Past the cap nothing further is
	// stored and the work is redone on the spot: slower, still correct.
	celCacheLimit = 1024
)

var (
	celEnvCache     = newCELCache[*cel.Env]()
	celProgramCache = newCELCache[compiledRule]()
)

// celCache memoises the two pure but expensive halves of running a rule: the
// environment, which depends only on the set of declared roots, and the
// compiled program, which depends only on that environment and the rule text.
// Neither can change for a given key, and both were rebuilt on every single
// evaluation — a fresh environment per flag, and a re-parse, re-check and
// re-compile per rule — on the hottest read path in the product.
type celCache[V any] struct {
	mu      sync.RWMutex
	entries map[string]V
}

func newCELCache[V any]() *celCache[V] {
	return &celCache[V]{entries: map[string]V{}}
}

func (c *celCache[V]) load(key string) (V, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	value, ok := c.entries[key]

	return value, ok
}

func (c *celCache[V]) store(key string, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if len(c.entries) >= celCacheLimit {
		return
	}
	c.entries[key] = value
}
