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

// TargetingKnownValue is one value a string field is usually compared with: what
// goes in the rule, and what an author reads to recognise it.
type TargetingKnownValue struct {
	Value       string `json:"value" doc:"The literal as it is written in a rule, e.g. a plan's slug"`
	Label       string `json:"label,omitempty" doc:"Human-readable name of the value, e.g. a plan's display name"`
	Description string `json:"description,omitempty" doc:"What the value is, when the label is not enough"`
}

// TargetingContextNode is one name a rule may read, and whatever is reachable
// below it. Recursive by nature: the context is a tree, and a customer-declared
// namespace will nest as deeply as the customer nests it.
type TargetingContextNode struct {
	EntitlementType string `json:"entitlementType,omitempty" doc:"Original catalogue type on a known entitlement entry only, not a metadata or CONFIG key"`
	// Values is the shape shared by every entry of a map, when there is one.
	// `__kaiten.instance.metadata` is free-form, so each entry is dyn.
	Values *TargetingContextNode `json:"values,omitempty" doc:"Shape shared by every entry, for a map"`

	// Entries are the shapes of a map's known keys, for a map whose entries
	// differ. `__kaiten.entitlements` is keyed by a slug the organization
	// chooses, and each entry reads in the shape of that entitlement's type:
	// an object for a NUMBER, a boolean, or a map for a CONFIG.
	Entries []TargetingContextNode `json:"entries,omitempty" nullable:"false" doc:"Shape of each known key, for a map whose entries differ. Named after the key"`

	Name        string             `json:"name" doc:"Name as it is written in a rule"`
	Type        TargetingValueType `json:"type" enum:"string,number,boolean,object,map,dyn" doc:"Shape of this node's value"`
	Description string             `json:"description,omitempty" doc:"What this value means, shown by the editor"`

	// Fields are the named children of an object, in declaration order.
	Fields []TargetingContextNode `json:"fields,omitempty" nullable:"false" doc:"Named children, for an object"`

	// KnownKeys are the keys a map actually has right now — the organization's
	// entitlement slugs. Advisory: a map is still readable under any key, and
	// an empty list means only that none are known, never that none are legal.
	KnownKeys []string `json:"knownKeys,omitempty" nullable:"false" doc:"Keys this map currently has, for completion. Not a closed set"`

	// KnownValues are the values a string field is usually compared with — the
	// organization's plan slugs for `license.familySlug`, the four statuses for
	// `instance.status`. Advisory like KnownKeys: the lint is what refuses a
	// value, and only for the fields where the set is known to be complete.
	KnownValues []TargetingKnownValue `json:"knownValues,omitempty" nullable:"false" doc:"Values this string is usually compared with, for completion. Not a closed set"`

	// Optional marks a value that may be absent. It matters to a rule author
	// because CEL raises on a missing field rather than returning false, so
	// these are the ones worth guarding with has().
	Optional bool `json:"optional,omitempty" doc:"Whether this value may be absent, in which case has() is worth using"`
}

/*
TargetingContextRoots is every identifier the server guarantees, ready for an
editor to complete against.

catalogue is what the organization has: its entitlement slugs complete
__kaiten.entitlements, and its plans, license versions and deployment zones
complete the string facts a rule compares them with (see targeting_values.go).
Any part of it may be nil — a caller without it still gets the whole shape,
minus the suggestions.

What this does NOT return is "the identifiers a rule may use": a host sends its
own attributes in the evaluation context and targets on them, which the linter
deliberately allows (see LintTargetingRule). An editor must offer these and
still accept anything else.
*/
func TargetingContextRoots(catalogue TargetingCatalogue) []TargetingContextNode {
	license := factNode(LicenseRoot, "The license the organization holds.", reflect.TypeFor[LicenseFact]())
	withCatalogueValues(&license, LicenseRoot, catalogue)
	zone := factNode(DeploymentZoneRoot, "The deployment zone the instance runs in.", reflect.TypeFor[DeploymentZoneFact]())
	withCatalogueValues(&zone, DeploymentZoneRoot, catalogue)

	return []TargetingContextNode{
		{
			Name:        FactsRoot,
			Type:        TargetingTypeObject,
			Description: "Facts the server computes for every evaluation. Reserved: nothing a caller sends can set it.",
			Fields: []TargetingContextNode{
				license,
				entitlementsNode(catalogue.Entitlements),
				factNode(InstanceRoot, "The instance being evaluated.", reflect.TypeFor[InstanceFact]()),
				factNode(CustomerRoot, "The customer the instance belongs to.", reflect.TypeFor[CustomerFact]()),
				zone,
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
// by its own slugs, whose entries each read in the shape of their type. Both
// ways of reading it — `entitlements['seats']` and `entitlements.seats` — reach
// the same entry, which is why the linter checks both.
//
// There is no shared Values: a slug outside the catalogue has no known shape.
func entitlementsNode(knownEntitlements []KnownEntitlement) TargetingContextNode {
	slugs := make([]string, 0, len(knownEntitlements))
	entries := make([]TargetingContextNode, 0, len(knownEntitlements))
	for _, known := range knownEntitlements {
		slugs = append(slugs, known.Slug)
		node := entitlementNode(known)
		node.EntitlementType = known.DeclaredType
		entries = append(entries, node)
	}

	return TargetingContextNode{
		Name:        EntitlementsRoot,
		Type:        TargetingTypeMap,
		Description: "What the license grants, keyed by entitlement slug, in the shape of each entitlement's type. Readable as entitlements['seats'] or entitlements.seats.",
		KnownKeys:   slugs,
		Entries:     entries,
	}
}

// entitlementNode is one entitlement, in the shape its type reads in.
func entitlementNode(known KnownEntitlement) TargetingContextNode {
	switch known.Type {
	case EntitlementBoolean:
		return TargetingContextNode{
			Name:        known.Slug,
			Type:        TargetingTypeBoolean,
			Description: "BOOLEAN entitlement: true when the license grants it. Compare it directly: == true",
		}
	case EntitlementConfig:
		return TargetingContextNode{
			Name:        known.Slug,
			Type:        TargetingTypeMap,
			Description: "CONFIG entitlement: the object the license grants. Its keys are whatever the license sets",
			Values:      &TargetingContextNode{Type: TargetingTypeDyn},
		}
	default:
		return factNode(known.Slug, "NUMBER entitlement: what the license grants, and what is used of it.", reflect.TypeFor[EntitlementFact]())
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

		node := valueNode(name, field.Tag.Get("doc"), field.Type)
		node.KnownValues = tagValues(field)
		nodes = append(nodes, node)
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
