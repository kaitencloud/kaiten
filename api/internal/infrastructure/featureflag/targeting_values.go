package featureflag

import (
	"fmt"
	"reflect"
	"sort"
	"strings"
)

/*
Known values are what a rule author picks from instead of typing a slug from
memory: `__kaiten.license.familySlug == 'bronze'` is a comparison with a value
Kaiten itself knows, and a misspelling of it is a rule that saves cleanly and
never matches.

Two things consume them, from this one declaration: the schema offers them to
the editor (context_schema.go), and the lint refuses a rule that compares one of
these fields with a literal that is not among them (unknownValue). The rule
stays plain CEL — nothing here changes how a rule is evaluated.

A value comes from one of two places. The ones that depend on the organization —
its plans, its license versions, its deployment zones — arrive in a
TargetingCatalogue, read by the caller. The ones that do not are closed enums
declared on the fact struct's `enum` tag (facts.go), which the lint can always
check, catalogue or not.
*/

// TargetingCatalogue is everything about an organization that a rule is checked
// against and an editor completes from: the entitlements it declares, and the
// plans, license versions and deployment zones a rule may compare a fact with.
//
// A nil list means "unknown" for that part — the read failed, or the caller has
// no catalogue to hand — and is never the same as an empty one, which says the
// organization has none. Unknown skips its check and offers no suggestions;
// empty refuses every literal, since none can be right.
type TargetingCatalogue struct {
	Entitlements []KnownEntitlement
	// Plans are the license families, by family slug.
	Plans []TargetingKnownValue
	// Licenses are every license version, by version slug, whatever its
	// lifecycle state: an instance can still sit on an archived one.
	Licenses        []TargetingKnownValue
	DeploymentZones []TargetingKnownValue
}

// valueField is one string fact a rule is checked and completed against.
type valueField struct {
	subroot string
	field   string
	// noun completes "which is not …" in the lint's message.
	noun string
	// list picks the values out of the catalogue. Nil for a closed enum, whose
	// values are the field's `enum` tag.
	list func(TargetingCatalogue) []TargetingKnownValue
}

var valueFields = []valueField{
	{LicenseRoot, "familySlug", "a plan of this organization", func(c TargetingCatalogue) []TargetingKnownValue { return c.Plans }},
	{LicenseRoot, "slug", "a license version of this organization", func(c TargetingCatalogue) []TargetingKnownValue { return c.Licenses }},
	{DeploymentZoneRoot, "slug", "a deployment zone of this organization", func(c TargetingCatalogue) []TargetingKnownValue { return c.DeploymentZones }},
	{LicenseRoot, "type", "a license type", nil},
	{InstanceRoot, "status", "an instance status", nil},
}

// factTypes is the struct behind each sub-root, for reading a field's tags.
var factTypes = map[string]reflect.Type{
	LicenseRoot:        reflect.TypeFor[LicenseFact](),
	InstanceRoot:       reflect.TypeFor[InstanceFact](),
	CustomerRoot:       reflect.TypeFor[CustomerFact](),
	DeploymentZoneRoot: reflect.TypeFor[DeploymentZoneFact](),
}

// enumValues is the closed set of each enum-checked field, keyed by
// `<subroot>.<field>`, read once off the struct tags.
var enumValues = func() map[string][]TargetingKnownValue {
	enums := map[string][]TargetingKnownValue{}

	for _, f := range valueFields {
		if f.list != nil {
			continue
		}

		t := factTypes[f.subroot]
		for i := range t.NumField() {
			if jsonName(t.Field(i)) == f.field {
				enums[f.subroot+"."+f.field] = tagValues(t.Field(i))
			}
		}
	}

	return enums
}()

// jsonName is the name a struct field is written under in a rule.
func jsonName(field reflect.StructField) string {
	name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
	if name == "" {
		name = field.Name
	}

	return name
}

// tagValues reads the values a field declares on its `enum` tag, or failing
// that its `suggest` tag.
func tagValues(field reflect.StructField) []TargetingKnownValue {
	list := field.Tag.Get("enum")
	if list == "" {
		list = field.Tag.Get("suggest")
	}
	if list == "" {
		return nil
	}

	values := make([]TargetingKnownValue, 0, strings.Count(list, ",")+1)
	for value := range strings.SplitSeq(list, ",") {
		values = append(values, TargetingKnownValue{Value: value})
	}

	return values
}

// withCatalogueValues puts the catalogue's values on the fields of one sub-root
// that have any. A part the catalogue does not know leaves the node as it is.
func withCatalogueValues(node *TargetingContextNode, subroot string, catalogue TargetingCatalogue) {
	for _, f := range valueFields {
		if f.subroot != subroot || f.list == nil {
			continue
		}

		values := f.list(catalogue)
		if values == nil {
			continue
		}

		for i := range node.Fields {
			if node.Fields[i].Name == f.field {
				node.Fields[i].KnownValues = values
			}
		}
	}
}

// valueFieldAt reports the fact a `__kaiten.<subroot>.<field>` path names, when
// a literal compared with it is checked.
func valueFieldAt(subroot, field string) (valueField, bool) {
	for _, f := range valueFields {
		if f.subroot == subroot && f.field == field {
			return f, true
		}
	}

	return valueField{}, false
}

// maxListedValues bounds how many values a message names: an organization with
// hundreds of license versions would otherwise get a screenful for a typo.
const maxListedValues = 20

// unknownValue reports a literal that is not among the values the field is
// checked against. It says nothing when the catalogue does not know them.
func unknownValue(rule string, f valueField, literal string, catalogue TargetingCatalogue) error {
	var values []TargetingKnownValue
	if f.list == nil {
		values = enumValues[f.subroot+"."+f.field]
	} else {
		values = f.list(catalogue)
	}
	if values == nil {
		return nil
	}

	names := make([]string, 0, len(values))
	for _, known := range values {
		if known.Value == literal {
			return nil
		}
		names = append(names, known.Value)
	}
	sort.Strings(names)

	available := "none"
	if len(names) > 0 {
		available = strings.Join(names[:min(len(names), maxListedValues)], ", ")
		if len(names) > maxListedValues {
			available += fmt.Sprintf(", … (%d more)", len(names)-maxListedValues)
		}
	}

	return fmt.Errorf(
		"rule %q compares %s.%s.%s with '%s', which is not %s — available: %s",
		rule, FactsRoot, f.subroot, f.field, literal, f.noun, available,
	)
}
