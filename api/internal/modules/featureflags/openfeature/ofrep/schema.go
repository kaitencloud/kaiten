package ofrep

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
)

type Context map[string]any

func (c Context) ToEvaluationContext() openfeature.EvaluationContext {
	ec := openfeature.EvaluationContext{
		Inputs: make(map[string]any),
	}

	for k, v := range c {
		if k == "targetingKey" {
			if s, ok := v.(string); ok {
				ec.TargetingKey = s
			}
			continue
		}
		ec.Inputs[k] = v
	}

	return ec
}

type Metadata *map[string]any

type EvaluationSuccess struct {
	Key      string   `json:"key" doc:"Feature flag key"`
	Value    any      `json:"value,omitempty" doc:"Flag evaluation result"`
	Reason   string   `json:"reason,omitempty" example:"STATIC" doc:"OpenFeature reason for the evaluation"`
	Variant  string   `json:"variant,omitempty" doc:"string of the evaluated flag value"`
	Metadata Metadata `json:"metadata,omitempty" doc:"Arbitrary metadata for the flag"`
}

type EvaluationFailure struct {
	Key          string   `json:"key" doc:"Feature flag key"`
	ErrorCode    string   `json:"errorCode" doc:"OpenFeature compatible error code"`
	ErrorDetails string   `json:"errorDetails,omitempty" doc:"Error description"`
	Metadata     Metadata `json:"metadata,omitempty" doc:"Arbitrary metadata for the flag"`
}

type BulkEvaluationSuccess struct {
	Flags    []any    `json:"flags" doc:"Array of evaluation results"`
	Metadata Metadata `json:"metadata,omitempty" doc:"Arbitrary metadata for the flag set"`
}

type BulkEvaluationFailure struct {
	ErrorCode    string `json:"errorCode" doc:"Error code specific to the bulk evaluation error"`
	ErrorDetails string `json:"errorDetails,omitempty" doc:"Optional error details description"`
}

type BulkEvaluationRequest struct {
	Context Context `json:"context,omitempty"`
}

type EvaluateFlagsBulkInput struct {
	IfNoneMatch string `header:"If-None-Match" doc:"The request will be processed only if ETag doesn't match"`
	Body        BulkEvaluationRequest
}
