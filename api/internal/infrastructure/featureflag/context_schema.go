package featureflag

import (
	"reflect"
	"strings"
)

/*
The targeting context schema is what an author is allowed to read in a rule,
described well enough for an editor to complete it and to say what each name
means.

It is derived from the same fact structs the linter checks against and the
enrichment writes (facts.go), by the same reflection, so the three cannot
disagree: a field added to LicenseFact is offered by the editor, accepted by
the lint and populated at evaluation without anybody maintaining a list. That
is the whole point of deriving it — the console used to carry a hand-written
catalogue of variables that named `license.plan` and `customer.tier`, neither
of which has ever existed, and a rule written from it linted clean as a host
attribute and then silently never matched.

The world stays open. A host sends its own attributes and targets on them, so
this schema is what the *server* guarantees, never the complete set of legal
identifiers — see TargetingContextRoots.
*/

// TargetingValueType is the shape of one node, in the terms a rule author
// thinks in rather than Go's. Only the distinctions that change what an editor
// should offer are kept: a `map` takes an arbitrary key where an `object` takes
// one of a fixed set of fields, and `dyn` is the honest answer for a value
// whose shape nobody declared.
type TargetingValueType string

const (
	TargetingTypeString  TargetingValueType = "string"
	TargetingTypeNumber  TargetingValueType = "number"
	TargetingTypeBoolean TargetingValueType = "boolean"
	TargetingTypeObject  TargetingValueType = "object"
	TargetingTypeMap     TargetingValueType = "map"
	TargetingTypeDyn     TargetingValueType = "dyn"
)

// TargetingContextNode is one name a rule may read, and whatever is reachable
// below it. Recursive by nature: the context is a tree, and a customer-declared
// namespace will nest as deeply as the customer nests it.
type TargetingContextNode struct {
	// Values is the shape shared by every entry of a map, when there is one.
	// `__kaiten.entitlements` is keyed by a slug the organization chooses, but
	// each entry underneath is an EntitlementFact like any other.
	Values *TargetingContextNode `json:"values,omitempty" doc:"Shape shared by every entry, for a map"`

	Name        string             `json:"name" doc:"Name as it is written in a rule"`
	Type        TargetingValueType `json:"type" enum:"string,number,boolean,object,map,dyn" doc:"Shape of this node's value"`
	Description string             `json:"description,omitempty" doc:"What this value means, shown by the editor"`

	// Fields are the named children of an object, in declaration order.
	Fields []TargetingContextNode `json:"fields,omitempty" nullable:"false" doc:"Named children, for an object"`

	// KnownKeys are the keys a map actually has right now — the organization's
	// entitlement slugs. Advisory: a map is still readable under any key, and
	// an empty list means only that none are known, never that none are legal.
	KnownKeys []string `json:"knownKeys,omitempty" nullable:"false" doc:"Keys this map currently has, for completion. Not a closed set"`

	// Optional marks a value that may be absent. It matters to a rule author
	// because CEL raises on a missing field rather than returning false, so
	// these are the ones worth guarding with has().
	Optional bool `json:"optional,omitempty" doc:"Whether this value may be absent, in which case has() is worth using"`
}

/*
TargetingContextRoots is every identifier the server guarantees, ready for an
editor to complete against.

knownEntitlements is the organization's catalogue, used to complete the slugs
under __kaiten.entitlements. It may be nil — a caller without one still gets
the whole shape, minus the slug suggestions.

What this does NOT return is "the identifiers a rule may use": a host sends its
own attributes in the evaluation context and targets on them, which the linter
deliberately allows (see LintTargetingRule). An editor must offer these and
still accept anything else.
*/
func TargetingContextRoots(knownEntitlements []string) []TargetingContextNode {
	return []TargetingContextNode{
		{
			Name:        FactsRoot,
			Type:        TargetingTypeObject,
			Description: "Facts the server computes for every evaluation. Reserved: nothing a caller sends can set it.",
			Fields: []TargetingContextNode{
				factNode(LicenseRoot, "The license the organization holds.", reflect.TypeFor[LicenseFact]()),
				entitlementsNode(knownEntitlements),
				factNode(InstanceRoot, "The instance being evaluated.", reflect.TypeFor[InstanceFact]()),
				factNode(CustomerRoot, "The customer the instance belongs to.", reflect.TypeFor[CustomerFact]()),
				factNode(DeploymentZoneRoot, "The deployment zone the instance runs in.", reflect.TypeFor[DeploymentZoneFact]()),
			},
		},
		{
			Name:        targetingKeyRoot,
			Type:        TargetingTypeString,
			Description: "The key this evaluation is bucketed on. Always present.",
		},
	}
}

// entitlementsNode describes __kaiten.entitlements: a map an organization keys
// by its own slugs, whose entries all have EntitlementFact's shape. Both ways
// of reading it — `entitlements['seats']` and `entitlements.seats` — reach the
// same entry, which is why the linter checks both.
func entitlementsNode(knownEntitlements []string) TargetingContextNode {
	values := factNode("", "", reflect.TypeFor[EntitlementFact]())

	return TargetingContextNode{
		Name:        EntitlementsRoot,
		Type:        TargetingTypeMap,
		Description: "Entitlement usage, keyed by slug. Readable as entitlements['seats'] or entitlements.seats.",
		KnownKeys:   knownEntitlements,
		Values:      &values,
	}
}

// factNode describes one fact struct as an object node.
func factNode(name, description string, t reflect.Type) TargetingContextNode {
	return TargetingContextNode{
		Name:        name,
		Type:        TargetingTypeObject,
		Description: description,
		Fields:      structNodes(t),
	}
}

// structNodes reads a struct's fields in declaration order, taking each name
// from the json tag the enrichment serialises with and each description from
// the doc tag beside it. factFields is expressed in terms of this, so the names
// the linter accepts are literally the names the editor offers.
func structNodes(t reflect.Type) []TargetingContextNode {
	nodes := make([]TargetingContextNode, 0, t.NumField())

	for i := range t.NumField() {
		field := t.Field(i)

		name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
		if name == "" {
			name = field.Name
		}
		if name == "-" {
			continue
		}

		nodes = append(nodes, valueNode(name, field.Tag.Get("doc"), field.Type))
	}

	return nodes
}

// valueNode maps one Go type onto the shape a rule author sees. A pointer is
// the same value, allowed to be absent.
func valueNode(name, description string, t reflect.Type) TargetingContextNode {
	node := TargetingContextNode{Name: name, Description: description}

	if t.Kind() == reflect.Pointer {
		node.Optional = true
		t = t.Elem()
	}

	switch t.Kind() {
	case reflect.String:
		node.Type = TargetingTypeString
	case reflect.Bool:
		node.Type = TargetingTypeBoolean
	case reflect.Float32, reflect.Float64,
		reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		node.Type = TargetingTypeNumber
	case reflect.Struct:
		node.Type = TargetingTypeObject
		node.Fields = structNodes(t)
	case reflect.Map:
		// Free-form JSONB an organization puts any key in. The lint stops
		// here for the same reason: there is nothing below to check against.
		node.Type = TargetingTypeMap
		node.Values = &TargetingContextNode{Type: TargetingTypeDyn}
	default:
		node.Type = TargetingTypeDyn
	}

	return node
}
