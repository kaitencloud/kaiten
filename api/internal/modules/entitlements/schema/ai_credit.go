package schema

import "errors"

// ValidateAICreditAggregation keeps a credit pool's counter additive. Ordinary
// NUMBER aggregations are unchanged; nil is resolved to SUM by creation first.
func ValidateAICreditAggregation(t Type, aggregation *AggregationMethod) error {
	if t == NumberAICredit && (aggregation == nil || *aggregation != Sum) {
		return errors.New("AI credit pools require SUM aggregation")
	}
	return nil
}
