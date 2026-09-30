package schema

import (
	"encoding/json"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
)

type Rule struct {
	Value string `json:"-"` // Remove the json tag since we're customizing marshaling
}

func NewRule(rule string) (*Rule, error) {
	if err := featureflag.ValidateRule(rule); err != nil {
		return nil, err
	}

	return &Rule{
		Value: rule,
	}, nil
}

func (r *Rule) UnmarshalJSON(data []byte) error {
	var ruleStr string

	err := json.Unmarshal(data, &ruleStr)
	if err != nil {
		ruleStr = string(data)
	}

	rule, err := NewRule(ruleStr)
	if err != nil {
		return err
	}

	*r = *rule
	return nil
}

func (r *Rule) MarshalJSON() ([]byte, error) {
	return json.Marshal(r.Value)
}

// ruleMaxLength bounds a rule's size. Real rules are a line or two; the widest
// legitimate ones enumerate a few dozen slugs and stay under a kilobyte. What
// the bound refuses is the pathological case: rule text is parsed (twice, via
// lintRoots) and compiled on paths a caller drives, and before this cap the
// only limit was the transport's multi-megabyte body ceiling. The lint
// endpoint declares the same number so the editor and the save cannot disagree
// about how long is too long.
const ruleMaxLength = 10_000

func (r *Rule) Schema(_ huma.Registry) *huma.Schema {
	maxLength := ruleMaxLength

	return &huma.Schema{
		Type:        "string",
		MaxLength:   &maxLength,
		Description: "CEL expression for basicTargeting evaluation",
	}
}
