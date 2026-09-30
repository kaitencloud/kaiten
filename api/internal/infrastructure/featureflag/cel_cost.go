package featureflag

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/cel-go/checker"
	"github.com/google/cel-go/interpreter"
)

/*
The bounds on running one rule.

A rule is text an author writes, and it runs on the evaluation path: once per
rehearsal, and on every evaluation of its flag once saved, with nothing further
from its author. CEL gives it comprehensions, and four `.all()` nested over
150-element literal lists fit in 1,250 characters and iterate 500 million
times: unbounded, that rule held a core for 22 seconds, and the 10,000
characters a rule may have buy hours. Nothing outside this package stops it —
the HTTP timeouts cut the response, not the goroutine computing it.

celCostLimit is the bound that decides. CEL charges roughly one unit per
operation, so the verdict does not depend on the machine or its load. The
number is set from both ends:

  - What it has to let through. The costliest of the 146 distinct rules in
    this repository — the demo seed, the API's examples, the console's
    templates and stories, the tests — costs 20, and none of them iterates.
    The widest allowlist the length cap allows, `targetingKey in [...]` with
    700 ids, costs 711 by the lint's estimate and 1 at evaluation, where the
    list is a set. Iterating a host's list costs 5 to 6 per element, so
    `.exists()` can still walk about 3,000 of them.
  - What it has to stop quickly. CEL's own accounting is not linear: each
    iteration of an unfinished comprehension searches a stack that grows by
    one per iteration, so the time to reach a limit grows with its square. A
    single `.all()` over a host list too long to finish reaches 100,000 after
    about a second on a laptop core, and 20,000 after 40ms. The nested
    literal loops above stop within 11ms.

OptOptimize computes constant expressions once, when the rule is compiled.
Without it, a list literal inside a loop was rebuilt on every iteration while
being charged a flat 10 however long it was, and such a rule held a core for
half a second without reaching the limit.

celEvalTimeout is a backstop for work the cost model undercounts in ways not
found yet, not a second limit. It is wall-clock time, so it also counts the
time a rule spends waiting for a CPU: at 100ms, one legitimate iterating rule
in eight failed as soon as 500 evaluations shared two cores. A second fails
none of them until the host is more than a second behind. It is read inside
comprehensions only, every celInterruptCheckFrequency iterations, so a rule
with fewer iterations than that is never interrupted by it.

celInterruptCheckFrequency is how late a deadline or a cancellation can be
noticed: a hundred iterations of a plain loop take microseconds.
*/
const (
	celCostLimit               = 20_000
	celEvalTimeout             = time.Second
	celInterruptCheckFrequency = 100
)

// ErrRuleTooCostly is a rule stopped for doing more work than celCostLimit
// allows. The lint refuses a rule whose own text commits it to that much; a rule
// whose work comes from the context it is judged against can only be stopped
// here, at evaluation.
var ErrRuleTooCostly = fmt.Errorf(
	"the rule does more work than a targeting rule may (the cost limit is %d): nest fewer comprehensions, or iterate over shorter lists",
	celCostLimit,
)

// ErrRuleTimedOut is a rule stopped for running longer than celEvalTimeout.
var ErrRuleTimedOut = fmt.Errorf(
	"the rule ran for longer than a targeting rule may (%s): nest fewer comprehensions, or iterate over shorter lists",
	celEvalTimeout,
)

// stoppedBecause names the bound an evaluation ran into in words an author can
// act on, rather than CEL's "operation cancelled" or "operation interrupted".
// Any other failure is passed on unchanged.
func stoppedBecause(err error) error {
	var cancelled interpreter.EvalCancelledError
	if errors.As(err, &cancelled) && cancelled.Cause == interpreter.CostLimitExceeded {
		return ErrRuleTooCostly
	}
	if errors.Is(err, ErrRuleTimedOut) {
		return ErrRuleTimedOut
	}

	return err
}

// singleElementInputs sizes everything the checker cannot size from the rule's
// own text — every host attribute, every fact — as holding one element. See
// costResult for why.
type singleElementInputs struct{}

func (singleElementInputs) EstimateSize(checker.AstNode) *checker.SizeEstimate {
	size := checker.FixedSizeEstimate(1)
	return &size
}

func (singleElementInputs) EstimateCallCost(string, string, *checker.AstNode, []checker.AstNode) *checker.CallEstimate {
	return nil
}
