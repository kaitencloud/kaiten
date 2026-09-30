package featureflag

import "fmt"

type ParseError struct {
	Rule string
	Err  error
}

func (e *ParseError) Error() string {
	return fmt.Sprintf("parse error in basicTargeting %q: %v", e.Rule, e.Err)
}
func (e *ParseError) Unwrap() error { return e.Err }

type CheckError struct {
	Rule string
	Err  error
}

func (e *CheckError) Error() string {
	return fmt.Sprintf("check error in basicTargeting %q: %v", e.Rule, e.Err)
}
func (e *CheckError) Unwrap() error { return e.Err }

type CompileError struct {
	Rule string
	Err  error
}

func (e *CompileError) Error() string {
	return fmt.Sprintf("compile error in basicTargeting %q: %v", e.Rule, e.Err)
}
func (e *CompileError) Unwrap() error { return e.Err }

type EvalError struct {
	Rule string
	Err  error
}

func (e *EvalError) Error() string {
	return fmt.Sprintf("eval error in basicTargeting %q: %v", e.Rule, e.Err)
}
func (e *EvalError) Unwrap() error { return e.Err }

type NonBoolResultError struct {
	Rule string
}

func (e *NonBoolResultError) Error() string {
	return fmt.Sprintf("basicTargeting %q did not evaluate to a boolean", e.Rule)
}
