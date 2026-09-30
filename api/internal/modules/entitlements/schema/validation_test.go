package schema_test

import (
	"testing"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

func TestValidateIcon(t *testing.T) {
	tests := []struct {
		name    string
		icon    string
		wantErr bool
	}{
		{"Valid simple", "lucide:rocket", false},
		{"Valid kebab name", "lucide:circle-slash", false},
		{"Valid digits", "lucide:a-arrow-down", false},
		{"Invalid no provider", "rocket", true},
		{"Invalid unknown provider", "heroicons:rocket", true},
		{"Invalid empty", "", true},
		{"Invalid empty name", "lucide:", true},
		{"Invalid empty provider", ":rocket", true},
		{"Invalid uppercase", "lucide:Rocket", true},
		{"Invalid trailing dash", "lucide:rocket-", true},
		{"Invalid space", "lucide:rocket ship", true},
		{"Invalid double separator", "lucide:rocket:ship", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := schema.ValidateIcon(tt.icon)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateIcon(%q) error = %v, wantErr %v", tt.icon, err, tt.wantErr)
			}
		})
	}
}

func TestValidateUnitsConfiguration(t *testing.T) {
	tests := []struct {
		name             string
		entitlementType  schema.Type
		unitSingular     *string
		unitPlural       *string
		saleUnitSingular *string
		saleUnitPlural   *string
		saleUnitFactor   *float64
		wantErr          bool
	}{
		{name: "Number without units", entitlementType: schema.Number, wantErr: false},
		{name: "Boolean without units", entitlementType: schema.Boolean, wantErr: false},
		{name: "Config without units", entitlementType: schema.Config, wantErr: false},
		{
			name:            "Number with base pair only",
			entitlementType: schema.Number,
			unitSingular:    ptr.To("seat"), unitPlural: ptr.To("seats"),
			wantErr: false,
		},
		{
			name:            "Number with full unit configuration",
			entitlementType: schema.Number,
			unitSingular:    ptr.To("seat"), unitPlural: ptr.To("seats"),
			saleUnitSingular: ptr.To("pack"), saleUnitPlural: ptr.To("packs"),
			saleUnitFactor: ptr.To(3.0),
			wantErr:        false,
		},
		{
			name:            "Number with decimal factor",
			entitlementType: schema.Number,
			unitSingular:    ptr.To("MB"), unitPlural: ptr.To("MB"),
			saleUnitSingular: ptr.To("GB"), saleUnitPlural: ptr.To("GB"),
			saleUnitFactor: ptr.To(1000.5),
			wantErr:        false,
		},
		{
			name:            "Boolean with base pair",
			entitlementType: schema.Boolean,
			unitSingular:    ptr.To("seat"), unitPlural: ptr.To("seats"),
			wantErr: true,
		},
		{
			name:            "Config with factor only",
			entitlementType: schema.Config,
			saleUnitFactor:  ptr.To(3.0),
			wantErr:         true,
		},
		{
			name:            "Singular without plural",
			entitlementType: schema.Number,
			unitSingular:    ptr.To("seat"),
			wantErr:         true,
		},
		{
			name:            "Plural without singular",
			entitlementType: schema.Number,
			unitPlural:      ptr.To("seats"),
			wantErr:         true,
		},
		{
			name:            "Sale singular alone",
			entitlementType: schema.Number,
			unitSingular:    ptr.To("seat"), unitPlural: ptr.To("seats"),
			saleUnitSingular: ptr.To("pack"),
			wantErr:          true,
		},
		{
			name:            "Sale pair without factor",
			entitlementType: schema.Number,
			unitSingular:    ptr.To("seat"), unitPlural: ptr.To("seats"),
			saleUnitSingular: ptr.To("pack"), saleUnitPlural: ptr.To("packs"),
			wantErr: true,
		},
		{
			name:             "Sale trio without base pair",
			entitlementType:  schema.Number,
			saleUnitSingular: ptr.To("pack"), saleUnitPlural: ptr.To("packs"),
			saleUnitFactor: ptr.To(3.0),
			wantErr:        true,
		},
		{
			name:            "Factor zero",
			entitlementType: schema.Number,
			unitSingular:    ptr.To("seat"), unitPlural: ptr.To("seats"),
			saleUnitSingular: ptr.To("pack"), saleUnitPlural: ptr.To("packs"),
			saleUnitFactor: ptr.To(0.0),
			wantErr:        true,
		},
		{
			name:            "Factor negative",
			entitlementType: schema.Number,
			unitSingular:    ptr.To("seat"), unitPlural: ptr.To("seats"),
			saleUnitSingular: ptr.To("pack"), saleUnitPlural: ptr.To("packs"),
			saleUnitFactor: ptr.To(-1.0),
			wantErr:        true,
		},
		{
			name:            "Empty label",
			entitlementType: schema.Number,
			unitSingular:    ptr.To(""), unitPlural: ptr.To("seats"),
			wantErr: true,
		},
		{
			name:            "Whitespace label",
			entitlementType: schema.Number,
			unitSingular:    ptr.To("seat"), unitPlural: ptr.To("   "),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := schema.ValidateUnitsConfiguration(
				tt.entitlementType,
				tt.unitSingular, tt.unitPlural,
				tt.saleUnitSingular, tt.saleUnitPlural, tt.saleUnitFactor,
			)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateUnitsConfiguration(%s) error = %v, wantErr %v", tt.name, err, tt.wantErr)
			}
		})
	}
}

func TestValidateIcon_TooLong(t *testing.T) {
	long := "lucide:"
	for range 70 {
		long += "a"
	}
	if err := schema.ValidateIcon(long); err == nil {
		t.Errorf("ValidateIcon(%q) expected error for length > %d", long, 64)
	}
}

func TestValidateTypeConfiguration(t *testing.T) {
	tests := []struct {
		name              string
		entitlementType   schema.Type
		aggregationMethod *schema.AggregationMethod
		wantErr           bool
	}{
		{"Number defaults to Sum", schema.Number, ptr.To(schema.Sum), false},
		{"Number with Count", schema.Number, ptr.To(schema.Count), false},
		{"Number with Average", schema.Number, ptr.To(schema.Average), false},
		{"Number with Min", schema.Number, ptr.To(schema.Min), false},
		{"Number with Max", schema.Number, ptr.To(schema.Max), false},
		{"Number with Latest", schema.Number, ptr.To(schema.Latest), false},
		{"Number without aggregationMethod", schema.Number, nil, true},
		{"Number with unsupported aggregationMethod", schema.Number, ptr.To(schema.AggregationMethod("BOGUS")), true},
		{"Boolean without aggregationMethod", schema.Boolean, nil, false},
		{"Boolean with aggregationMethod", schema.Boolean, ptr.To(schema.Sum), true},
		{"Config without aggregationMethod", schema.Config, nil, false},
		{"Config with aggregationMethod", schema.Config, ptr.To(schema.Sum), true},
		{"Unsupported entitlement type", schema.Type("BOGUS"), nil, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := schema.ValidateTypeConfiguration(tt.entitlementType, tt.aggregationMethod)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateTypeConfiguration(%s) error = %v, wantErr %v", tt.name, err, tt.wantErr)
			}
		})
	}
}

func TestValidateResetConfiguration(t *testing.T) {
	tests := []struct {
		name              string
		entitlementType   schema.Type
		aggregationMethod *schema.AggregationMethod
		resetPeriod       *period.ResetPeriod
		resetAnchor       *period.ResetAnchor
		wantErr           bool
	}{
		{"Lifetime Number", schema.Number, ptr.To(schema.Sum), nil, nil, false},
		{"Lifetime Boolean", schema.Boolean, nil, nil, nil, false},
		{"Number monthly calendar", schema.Number, ptr.To(schema.Sum), ptr.To(period.Month), ptr.To(period.Calendar), false},
		{"Number hourly license start", schema.Number, ptr.To(schema.Count), ptr.To(period.Hour), ptr.To(period.LicenseStart), false},
		{"NumberAICredit monthly calendar", schema.NumberAICredit, ptr.To(schema.Sum), ptr.To(period.Month), ptr.To(period.Calendar), false},
		{"All five cadences", schema.Number, ptr.To(schema.Sum), ptr.To(period.Year), ptr.To(period.Calendar), false},

		{"Anchor without period", schema.Number, ptr.To(schema.Sum), nil, ptr.To(period.Calendar), true},
		{"Period without anchor", schema.Number, ptr.To(schema.Sum), ptr.To(period.Month), nil, true},
		{"Unsupported period value", schema.Number, ptr.To(schema.Sum), ptr.To(period.ResetPeriod("DECADE")), ptr.To(period.Calendar), true},
		{"Unsupported anchor value", schema.Number, ptr.To(schema.Sum), ptr.To(period.Month), ptr.To(period.ResetAnchor("SOLSTICE")), true},
		{"Boolean with reset period", schema.Boolean, nil, ptr.To(period.Month), ptr.To(period.Calendar), true},
		{"Config with reset period", schema.Config, nil, ptr.To(period.Month), ptr.To(period.Calendar), true},
		{"Number with LATEST rejected", schema.Number, ptr.To(schema.Latest), ptr.To(period.Month), ptr.To(period.Calendar), true},
		{"NumberAICredit with LATEST rejected", schema.NumberAICredit, ptr.To(schema.Latest), ptr.To(period.Day), ptr.To(period.Calendar), true},
		{"LATEST without reset period is fine", schema.Number, ptr.To(schema.Latest), nil, nil, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := schema.ValidateResetConfiguration(tt.entitlementType, tt.aggregationMethod, tt.resetPeriod, tt.resetAnchor)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateResetConfiguration(%s) error = %v, wantErr %v", tt.name, err, tt.wantErr)
			}
		})
	}
}

func TestIsSupportedAggregationMethod(t *testing.T) {
	tests := []struct {
		name   string
		method schema.AggregationMethod
		want   bool
	}{
		{"Count", schema.Count, true},
		{"Sum", schema.Sum, true},
		{"Average", schema.Average, true},
		{"Min", schema.Min, true},
		{"Max", schema.Max, true},
		{"Latest", schema.Latest, true},
		{"Empty", "", false},
		{"Unsupported", "BOGUS", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := schema.IsSupportedAggregationMethod(tt.method); got != tt.want {
				t.Errorf("IsSupportedAggregationMethod(%s) = %v, want %v", tt.method, got, tt.want)
			}
		})
	}
}
