package getsummary

import "time"

// Range is the period the summary's rates and lists cover.
type Range string

const (
	Range7Days  Range = "7d"
	Range30Days Range = "30d"
	Range90Days Range = "90d"
)

// Days is the range's length. An unknown value reads as 30 days.
func (r Range) Days() int {
	switch r {
	case Range7Days:
		return 7
	case Range90Days:
		return 90
	default:
		return 30
	}
}

// Visibility is which blocks the caller may read, from its scopes. The
// operation itself needs read:customers, read:instances and read:licenses,
// the three the home is made of; a block whose module the caller cannot read
// is left out rather than refused, so a narrow role still gets its home.
type Visibility struct {
	FeatureFlags    bool
	Releases        bool
	DeploymentZones bool
	Tokens          bool
	PublishableKeys bool
	Connectors      bool
	Billing         bool
}

// Query is what the summary is computed for.
type Query struct {
	Range      Range
	Visibility Visibility
}

// Every type below is named with the Dashboard prefix so that its OpenAPI
// schema cannot collide with another module's (Connector, Zone, Billing).

// DashboardSummary is the console's home in one response: what needs
// attention, the figures, and the lists behind them, computed in the database
// over the whole organization. Blocks the caller's scopes exclude are absent.
type DashboardSummary struct {
	AsOf      time.Time            `json:"asOf" doc:"When the figures were computed"`
	Range     DashboardRangeWindow `json:"range"`
	Attention DashboardAttention   `json:"attention"`
	Figures   DashboardFigures     `json:"figures"`

	Saturation   []DashboardMeter       `json:"saturation" nullable:"false" doc:"The meters closest to the most their grant allows, highest ratio first, at most eight"`
	UsageReports DashboardUsageReports  `json:"usageReports"`
	FeatureFlags *DashboardFeatureFlags `json:"featureFlags,omitempty" doc:"Absent when the caller cannot read feature flags"`
	Licenses     DashboardLicenses      `json:"licenses"`
	Zones        []DashboardZone        `json:"zones" nullable:"false" doc:"Empty when the caller cannot read deployment zones and releases"`
	Integrations *DashboardIntegrations `json:"integrations,omitempty" doc:"Who talks to Kaiten; absent when the caller can read none of tokens, publishable keys and connectors"`
	Billing      *DashboardBilling      `json:"billing,omitempty" doc:"Subscriptions and this month's invoices; absent when the caller cannot read billing. Whether billing is enabled for the organization is GET /billing/capabilities' answer, not this one's"`
}

// DashboardRangeWindow is the period, resolved, and the part of it the
// activity figures cover.
type DashboardRangeWindow struct {
	Range Range     `json:"range" enum:"7d,30d,90d"`
	From  time.Time `json:"from"`
	To    time.Time `json:"to"`
	Days  int       `json:"days"`
	// The activity figures are read from the audit trail and the usage history,
	// which each organization keeps for its own retention: a period that reaches
	// further back would count the deleted part as silence.
	ActivityFrom time.Time `json:"activityFrom" doc:"Where the activity figures start: usage reports accepted and refused, entitlement reads, flag evaluations, and the active and silent instances. From, unless the organization keeps its audit trail or its usage history for less than the period; then the start of what it keeps"`
	ActivityDays int       `json:"activityDays" doc:"The days from activityFrom to To, rounded up; Days when the activity figures cover the whole period"`
}

// DashboardAttention is what needs a decision, one check per member. Each
// carries its count over the whole organization and at most five items;
// Checked names the checks that ran, so an empty list can say what it looked
// at.
type DashboardAttention struct {
	LimitsReached       DashboardAttentionMeters    `json:"limitsReached" doc:"Meters at the most their grant allows, a hard limit or an allowance used up: the next report is refused"`
	NearThreshold       DashboardAttentionMeters    `json:"nearThreshold" doc:"Meters at or above the warning threshold of their grant, below the limit; an entitlement with no threshold never is"`
	RejectedReports24h  DashboardAttentionReports   `json:"rejectedReports24h" doc:"Usage reports refused in the last 24 hours, by instance"`
	SilentInstances     DashboardAttentionInstances `json:"silentInstances" doc:"Instances with no report, accepted or refused, and no entitlement read in the range"`
	InstancesNotHealthy DashboardAttentionInstances `json:"instancesNotHealthy" doc:"Instances whose status is not HEALTHY"`
	LicensesEnding30d   DashboardAttentionLicenses  `json:"licensesEnding30d" doc:"Instances whose License ends within 30 days"`
	ArchivedVersions    DashboardAttentionArchived  `json:"archivedVersions" doc:"Instances pinned to a License version withdrawn from sale"`
	TokensExpiring30d   DashboardAttentionTokens    `json:"tokensExpiring30d" doc:"Service account tokens that expire within 30 days"`
	ZonesBehind         DashboardAttentionZones     `json:"zonesBehind" doc:"Deployment zones running a release older than the newest one"`
	Checked             []string                    `json:"checked" nullable:"false" doc:"The checks that ran; one the caller's scopes exclude is absent"`
}

type DashboardAttentionMeters struct {
	Count int64            `json:"count"`
	Items []DashboardMeter `json:"items" nullable:"false"`
}

type DashboardAttentionReports struct {
	Count int64                      `json:"count"`
	Items []DashboardInstanceReports `json:"items" nullable:"false"`
}

type DashboardAttentionInstances struct {
	Count int64               `json:"count"`
	Items []DashboardInstance `json:"items" nullable:"false"`
}

type DashboardAttentionLicenses struct {
	Count int64                    `json:"count"`
	Items []DashboardLicenseEnding `json:"items" nullable:"false"`
}

type DashboardAttentionArchived struct {
	Count int64                      `json:"count"`
	Items []DashboardArchivedVersion `json:"items" nullable:"false"`
}

type DashboardAttentionTokens struct {
	Count int64                    `json:"count"`
	Items []DashboardTokenExpiring `json:"items" nullable:"false"`
}

type DashboardAttentionZones struct {
	Count int64           `json:"count"`
	Items []DashboardZone `json:"items" nullable:"false"`
}

// DashboardInstance names an instance and its customer, on a check that lists instances.
type DashboardInstance struct {
	InstanceSlug   string     `json:"instanceSlug"`
	InstanceName   string     `json:"instanceName"`
	CustomerSlug   string     `json:"customerSlug"`
	CustomerName   string     `json:"customerName"`
	Status         string     `json:"status,omitempty" doc:"The instance's status, on the status check"`
	LastActivityAt *time.Time `json:"lastActivityAt" doc:"The last accepted report or entitlement read in the range; null when silent"`
}

// DashboardFigures are the counters of the home.
type DashboardFigures struct {
	Customers    DashboardCustomerFigures    `json:"customers"`
	Instances    DashboardInstanceFigures    `json:"instances"`
	UsageReports DashboardUsageReportFigures `json:"usageReports"`
}

type DashboardCustomerFigures struct {
	Total          int64 `json:"total"`
	CreatedInRange int64 `json:"createdInRange"`
}

type DashboardInstanceFigures struct {
	Total          int64                   `json:"total"`
	CreatedInRange int64                   `json:"createdInRange"`
	ActiveInRange  int64                   `json:"activeInRange" doc:"Instances with at least one report, accepted or refused, or one entitlement read since range.activityFrom"`
	SilentInRange  int64                   `json:"silentInRange"`
	ByStatus       map[string]int64        `json:"byStatus" doc:"HEALTHY, DEGRADED, INCIDENT, MAINTENANCE"`
	ByStanding     DashboardStandingCounts `json:"byStanding" doc:"Instances by standing, over the whole organization"`
}

// DashboardStandingCounts counts the instances by the one word that sums each
// up: atLimit when one of its meters refuses, watch when one is above its
// warning threshold, silent when nothing reported or read in the range,
// healthy otherwise.
type DashboardStandingCounts struct {
	AtLimit int64 `json:"atLimit"`
	Watch   int64 `json:"watch"`
	Silent  int64 `json:"silent"`
	Healthy int64 `json:"healthy"`
}

type DashboardUsageReportFigures struct {
	Accepted    int64 `json:"accepted" doc:"Reports journalled in the range"`
	Rejected    int64 `json:"rejected" doc:"Reports refused in the range, from the audit trail"`
	Rejected24h int64 `json:"rejected24h"`
}

// DashboardMeter is one metered grant of one instance, against the most it
// allows. For a periodic entitlement the usage is the current window's, as the
// usage endpoints read it: a window that closed without a report reads 0.
type DashboardMeter struct {
	InstanceSlug            string     `json:"instanceSlug"`
	InstanceName            string     `json:"instanceName"`
	CustomerSlug            string     `json:"customerSlug"`
	CustomerName            string     `json:"customerName"`
	EntitlementSlug         string     `json:"entitlementSlug"`
	EntitlementName         string     `json:"entitlementName"`
	Unit                    *string    `json:"unit"`
	LicenseName             string     `json:"licenseName"`
	LicenseState            string     `json:"licenseState" enum:"DRAFT,PUBLISHED,ARCHIVED"`
	Used                    float64    `json:"used" doc:"Usage in the current window"`
	Granted                 *float64   `json:"granted" doc:"The grant; null when it is unlimited"`
	MaxAllowed              *float64   `json:"maxAllowed" doc:"The grant plus its allowance, the most a report is accepted up to; null when nothing refuses"`
	AllowancePercent        int        `json:"allowancePercent" doc:"0 is a hard limit, -1 an unlimited allowance"`
	Ratio                   *float64   `json:"ratio" doc:"used over maxAllowed, or over the grant when nothing refuses; null when there is no grant to measure against"`
	WarningThresholdPercent int        `json:"warningThresholdPercent" doc:"The entitlement's early-warning threshold, a percentage of the grant; 0 when none is configured"`
	LimitReached            bool       `json:"limitReached" doc:"Usage is at or past maxAllowed: the next report is refused"`
	HardLimit               bool       `json:"hardLimit" doc:"The grant allows nothing past itself"`
	AboveWarning            bool       `json:"aboveWarning" doc:"Usage is at or past the warning threshold of the grant, below the limit, as the report path warns; never without a threshold"`
	WindowStart             *time.Time `json:"windowStart" doc:"Start of the current window of a periodic entitlement; null for a lifetime one"`
}

// DashboardUsageReports is the integration's pulse: reports per day and per
// instance.
type DashboardUsageReports struct {
	PerDay     []DashboardDayReports      `json:"perDay" nullable:"false"`
	ByInstance []DashboardInstanceReports `json:"byInstance" nullable:"false" doc:"Every instance, most reports first"`
}

type DashboardDayReports struct {
	Day      time.Time `json:"day"`
	Accepted int64     `json:"accepted"`
	Rejected int64     `json:"rejected"`
}

type DashboardInstanceReports struct {
	InstanceSlug string          `json:"instanceSlug"`
	InstanceName string          `json:"instanceName"`
	CustomerSlug string          `json:"customerSlug"`
	CustomerName string          `json:"customerName"`
	LicenseName  string          `json:"licenseName"`
	LicenseState string          `json:"licenseState" enum:"DRAFT,PUBLISHED,ARCHIVED"`
	Accepted     int64           `json:"accepted"`
	Rejected     int64           `json:"rejected"`
	Rejected24h  int64           `json:"rejected24h"`
	LastReportAt *time.Time      `json:"lastReportAt"`
	LastReadAt   *time.Time      `json:"lastReadAt" doc:"The last entitlement value read since range.activityFrom"`
	Silent       bool            `json:"silent" doc:"No report, accepted or refused, and no entitlement read since range.activityFrom"`
	Standing     string          `json:"standing" enum:"atLimit,watch,silent,healthy" doc:"The one word for the instance: atLimit when a meter refuses, watch when one is above its warning threshold, silent when nothing reported or read since range.activityFrom, healthy otherwise; computed over every meter of the instance"`
	Headline     *DashboardMeter `json:"headline,omitempty" doc:"The meter that decides the standing, when one does: a meter at its limit before one above its threshold, the higher ratio first"`
}

// DashboardFeatureFlags is the flags block: evaluations per flag in the range.
type DashboardFeatureFlags struct {
	Total        int64                      `json:"total"`
	Enabled      int64                      `json:"enabled"`
	Evaluations  int64                      `json:"evaluations" doc:"Evaluations recorded since range.activityFrom; a floor, the evaluation publisher drops under pressure"`
	NotEvaluated int64                      `json:"notEvaluated" doc:"Flags with no evaluation since range.activityFrom"`
	PerFlag      []DashboardFlagEvaluations `json:"perFlag" nullable:"false" doc:"Every flag, most evaluated first"`
}

type DashboardFlagEvaluations struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Enabled     bool   `json:"enabled"`
	Evaluations int64  `json:"evaluations"`
}

// DashboardLicenses is the contract block: who runs what, what ends, what is
// archived.
type DashboardLicenses struct {
	Mix      []DashboardLicenseFamilyMix `json:"mix" nullable:"false"`
	Ending   DashboardLicensesEnding     `json:"ending"`
	Archived []DashboardArchivedVersion  `json:"archived" nullable:"false"`
}

type DashboardLicenseFamilyMix struct {
	FamilySlug string                       `json:"familySlug"`
	Instances  int64                        `json:"instances"`
	Versions   []DashboardLicenseVersionMix `json:"versions" nullable:"false"`
}

type DashboardLicenseVersionMix struct {
	Slug           string `json:"slug"`
	Name           string `json:"name"`
	Version        int32  `json:"version"`
	LifecycleState string `json:"lifecycleState" enum:"DRAFT,PUBLISHED,ARCHIVED"`
	IsDefault      bool   `json:"isDefault"`
	Instances      int64  `json:"instances"`
}

type DashboardLicensesEnding struct {
	Within30Days  int64                    `json:"within30Days"`
	Within180Days int64                    `json:"within180Days"`
	Items         []DashboardLicenseEnding `json:"items" nullable:"false" doc:"The next five to end"`
}

type DashboardLicenseEnding struct {
	InstanceSlug      string    `json:"instanceSlug"`
	InstanceName      string    `json:"instanceName"`
	CustomerSlug      string    `json:"customerSlug"`
	CustomerName      string    `json:"customerName"`
	LicenseName       string    `json:"licenseName"`
	EndsAt            time.Time `json:"endsAt"`
	BillingStatus     *string   `json:"billingStatus" doc:"The instance's subscription status, when it has one; null too when the caller cannot read billing (the billing block says which)"`
	CancelAtPeriodEnd bool      `json:"cancelAtPeriodEnd" doc:"The subscription ends with its period rather than renewing; false without one, and when the caller cannot read billing"`
}

type DashboardArchivedVersion struct {
	InstanceSlug       string  `json:"instanceSlug"`
	InstanceName       string  `json:"instanceName"`
	CustomerSlug       string  `json:"customerSlug"`
	CustomerName       string  `json:"customerName"`
	LicenseName        string  `json:"licenseName"`
	Version            int32   `json:"version"`
	FamilySlug         string  `json:"familySlug"`
	DefaultLicenseName *string `json:"defaultLicenseName" doc:"The version the family serves instead, when it has a published default"`
}

// DashboardZone is one deployment zone and the release it runs.
type DashboardZone struct {
	Slug           string     `json:"slug"`
	Name           string     `json:"name"`
	Type           string     `json:"type"`
	ReleaseVersion *string    `json:"releaseVersion" doc:"Null when nothing was deployed there"`
	DeployedAt     *time.Time `json:"deployedAt"`
	DeployedBy     *string    `json:"deployedBy"`
	Instances      int64      `json:"instances"`
	ReleasesBehind int64      `json:"releasesBehind" doc:"Releases created after the one the zone runs"`
}

// DashboardIntegrations is who talks to Kaiten.
type DashboardIntegrations struct {
	Tokens          *DashboardTokens          `json:"tokens,omitempty" doc:"Service accounts and their tokens; absent when the caller cannot read tokens"`
	PublishableKeys *DashboardPublishableKeys `json:"publishableKeys,omitempty" doc:"Absent when the caller cannot read publishable keys"`
	Connectors      *DashboardConnectors      `json:"connectors,omitempty" doc:"Absent when the caller cannot read the organization's connectors"`
}

type DashboardTokens struct {
	ServiceAccounts      int64                    `json:"serviceAccounts"`
	ActiveTokens         int64                    `json:"activeTokens"`
	TokensExpiring30Days int64                    `json:"tokensExpiring30Days"`
	TokensWithoutExpiry  int64                    `json:"tokensWithoutExpiry"`
	TokensExpiring       []DashboardTokenExpiring `json:"tokensExpiring" nullable:"false" doc:"The next five to expire"`
}

type DashboardPublishableKeys struct {
	Count      int64      `json:"count" doc:"Keys not revoked"`
	LastUsedAt *time.Time `json:"lastUsedAt" doc:"The last use of any of them"`
}

type DashboardConnectors struct {
	Items []DashboardConnector `json:"items" nullable:"false"`
}

type DashboardTokenExpiring struct {
	Name               string    `json:"name"`
	Slug               string    `json:"slug"`
	ServiceAccountSlug string    `json:"serviceAccountSlug"`
	ServiceAccountName string    `json:"serviceAccountName"`
	ExpiresAt          time.Time `json:"expiresAt"`
}

type DashboardConnector struct {
	Name        string     `json:"name"`
	Activated   bool       `json:"activated"`
	ActivatedAt *time.Time `json:"activatedAt"`
}

// DashboardBilling is the money block.
type DashboardBilling struct {
	Subscriptions     DashboardSubscriptions      `json:"subscriptions"`
	InvoicedThisMonth []DashboardInvoicedCurrency `json:"invoicedThisMonth" nullable:"false" doc:"Since the start of the calendar month, per currency, largest first"`
}

type DashboardSubscriptions struct {
	Active   int64 `json:"active"`
	Trial    int64 `json:"trial"`
	PastDue  int64 `json:"pastDue"`
	Canceled int64 `json:"canceled"`
}

type DashboardInvoicedCurrency struct {
	Currency   string `json:"currency"`
	Invoices   int64  `json:"invoices"`
	TotalMinor int64  `json:"totalMinor"`
	Paid       int64  `json:"paid"`
	Overdue    int64  `json:"overdue"`
}
