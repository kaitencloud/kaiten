package openfeature

import "errors"

type EvaluationContext struct {
	TargetingKey string                 `json:"targetingKey"` // Unique identifier for the user or entity
	Inputs       map[string]interface{} `json:"inputs"`       // Input data for evaluation, can be any type
}

func (e EvaluationContext) ToMap() map[string]interface{} {
	m := make(map[string]interface{}, len(e.Inputs)+1)
	for k, v := range e.Inputs {
		m[k] = v
	}
	m["targetingKey"] = e.TargetingKey
	return m
}

func (e EvaluationContext) Validate() error {
	if e.TargetingKey == "" {
		return errors.New("missing targeting key")
	}
	return nil
}
