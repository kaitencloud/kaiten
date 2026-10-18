// Package usage is the arithmetic of an entitlement usage counter, with no
// I/O and no context.Context: where a counter stands in its window (window.go),
// how a report folds into it (counter.go), what the grant allows (limit.go),
// whether a report is admitted (gate.go), which boundaries it crosses
// (crossings.go) and how a counter reads on the wire (present.go).
//
// The report use case loads a pair's state under its lock, asks these
// functions what to do, and writes what they decided in one step. The two
// gauges read the same state and present it with the same presenter, so the
// three answer one shape from one computation.
package usage

import "errors"

// Counter is a NUMBER-family counter: the folded value and how many reports
// produced it.
type Counter struct {
	Value      float64
	EventCount int32
}

// Zero is the counter of a window nothing was reported in yet.
func Zero() Counter { return Counter{} }

// Behavior says how a numeric report treats the stored counter.
type Behavior string

const (
	// Append folds the reported value into the counter through the
	// entitlement's aggregation method.
	Append Behavior = "append"
	// Set overwrites the counter with the reported value.
	Set Behavior = "set"
)

// ErrUnknownBehavior is returned by Fold for a behavior other than Append
// and Set.
var ErrUnknownBehavior = errors.New("behavior must be one of: append, set")

// Fold returns the counter after one report of value.
//
// A set leaves EventCount at 1, not 0: a set IS one reported observation of
// the counter, and the pair {value, eventCount} has to stay coherent --
// {60, 0} would claim a value nothing produced. It is also what makes a
// following AVERAGE append correct, since the average folds on the stored
// count: ((60*1)+40)/2 = 50, the average of the two observations. With 0 it
// would compute ((60*0)+40)/1 = 40 and the value just set would vanish.
//
// A set writes the ABSOLUTE value, so correcting 60 down to 25 under a cap
// of 30 is compared as 25 > 30 and accepted: only a set that lands above
// what the grant allows is refused, and that is the gate's call, not this
// function's.
func Fold(current Counter, value float64, behavior Behavior, aggregationMethod string) (Counter, error) {
	switch behavior {
	case Set:
		return Counter{Value: value, EventCount: 1}, nil
	case Append:
		strategy, err := SelectAppendStrategy(aggregationMethod)
		if err != nil {
			return Counter{}, aggregationError{err}
		}
		return Counter{
			Value:      strategy.Apply(current.Value, value, current.EventCount),
			EventCount: current.EventCount + 1,
		}, nil
	default:
		return Counter{}, ErrUnknownBehavior
	}
}

// ErrInvalidAggregation matches, through errors.Is, the error Fold returns
// for an aggregation method it cannot apply. The error's own message is the
// strategy selector's.
var ErrInvalidAggregation = errors.New("invalid aggregation configuration")

type aggregationError struct{ err error }

func (e aggregationError) Error() string        { return e.err.Error() }
func (e aggregationError) Is(target error) bool { return target == ErrInvalidAggregation }

// DefaultAggregationMethod is the method of an entitlement created before
// aggregationMethod became mandatory for NUMBER entitlements: SUM preserves
// the original CALCULATED_USAGE behavior.
const DefaultAggregationMethod = "SUM"
