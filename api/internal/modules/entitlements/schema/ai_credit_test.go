package schema

import "testing"

func TestValidateAICreditAggregation(t *testing.T) {
	for _, typ := range []Type{NumberAICredit, Number, Boolean, Config} {
		for _, aggregation := range []*AggregationMethod{nil, ptrAggregation(Sum), ptrAggregation(Count), ptrAggregation(Max), ptrAggregation(Min), ptrAggregation(Average), ptrAggregation(Latest)} {
			name := "nil"
			if aggregation != nil {
				name = string(*aggregation)
			}
			t.Run(string(typ)+"/"+name, func(t *testing.T) {
				wantError := typ == NumberAICredit && (aggregation == nil || *aggregation != Sum)
				if err := ValidateAICreditAggregation(typ, aggregation); (err != nil) != wantError {
					t.Fatalf("error = %v, want error=%v", err, wantError)
				}
			})
		}
	}
}

func ptrAggregation(method AggregationMethod) *AggregationMethod { return &method }
