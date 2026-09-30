package ofrep

import "encoding/json"

// toFactMap converts a fact struct (or a map of them, e.g. entitlements) to
// the map[string]any shape the evaluation context requires. The structs
// themselves live in infrastructure/featureflag, next to the lint that has to
// know their field names — see featureflag.LicenseFact and friends. Fact
// structs are fixed, compile-time-known shapes with no cycles or unsupported
// types, so a marshal error here would mean a programming mistake in those
// declarations, not a runtime condition to handle gracefully — degrade to an
// empty map rather than propagate an error type nothing calling this expects.
func toFactMap(fact any) map[string]any {
	b, err := json.Marshal(fact)
	if err != nil {
		return map[string]any{}
	}
	m := map[string]any{}
	_ = json.Unmarshal(b, &m)
	return m
}
