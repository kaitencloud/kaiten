package getsummary

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/dashboard/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

const (
	// topMeters is how many meters the saturation list carries.
	topMeters = 8
	// topItems is how many items each attention check names; its count is
	// over the whole organization.
	topItems = 5
	// soonDays is the horizon of "ending soon" and "expiring soon".
	soonDays = 30
	// endingHorizonDays is how far the Licenses-ending list looks.
	endingHorizonDays = 180
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider currentuser.Provider
	Queries      *db.Queries
}

type UseCase struct {
	deps Deps
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps}
}

// Execute computes the organization's summary. Every figure is read from the
// database over the whole organization; nothing is sampled or paged, and no
// read ticks a platform-usage counter: this is the console looking at itself,
// not an SDK reading an entitlement.
func (u *UseCase) Execute(ctx context.Context, q Query) (*DashboardSummary, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	c := &computation{
		q:     u.deps.Queries,
		org:   user.OrganizationID,
		now:   time.Now().UTC(),
		query: q,
	}
	c.from = c.now.AddDate(0, 0, -q.Range.Days())
	c.summary = &DashboardSummary{
		AsOf:       c.now,
		Range:      DashboardRangeWindow{Range: q.Range, From: c.from, To: c.now, Days: q.Range.Days()},
		Saturation: []DashboardMeter{},
		Zones:      []DashboardZone{},
	}
	c.summary.Attention = emptyAttention()

	steps := []struct {
		name string
		run  func(context.Context) error
	}{
		{"customers", c.customers},
		{"instances", c.instances},
		{"meters", c.meters},
		{"usage reports", c.usageReports},
		{"feature flags", c.featureFlags},
		{"licenses", c.licenses},
		{"zones", c.zones},
		{"integrations", c.integrations},
		{"billing", c.billing},
	}
	for _, step := range steps {
		if err := step.run(ctx); err != nil {
			return nil, fmt.Errorf("dashboard summary, %s: %w", step.name, err)
		}
	}
	return c.summary, nil
}

// computation carries one summary while its blocks are filled.
type computation struct {
	q       *db.Queries
	org     uuid.UUID
	now     time.Time
	from    time.Time
	query   Query
	summary *DashboardSummary
	// headline is the meter that decides each instance's standing, by slug,
	// over every meter of the organization: a meter at its limit before one
	// above its threshold, the higher ratio first.
	headline map[string]DashboardMeter
}

func emptyAttention() DashboardAttention {
	return DashboardAttention{
		LimitsReached:       DashboardAttentionMeters{Items: []DashboardMeter{}},
		NearThreshold:       DashboardAttentionMeters{Items: []DashboardMeter{}},
		RejectedReports24h:  DashboardAttentionReports{Items: []DashboardInstanceReports{}},
		SilentInstances:     DashboardAttentionInstances{Items: []DashboardInstance{}},
		InstancesNotHealthy: DashboardAttentionInstances{Items: []DashboardInstance{}},
		LicensesEnding30d:   DashboardAttentionLicenses{Items: []DashboardLicenseEnding{}},
		ArchivedVersions:    DashboardAttentionArchived{Items: []DashboardArchivedVersion{}},
		TokensExpiring30d:   DashboardAttentionTokens{Items: []DashboardTokenExpiring{}},
		ZonesBehind:         DashboardAttentionZones{Items: []DashboardZone{}},
		Checked:             []string{},
	}
}

func (c *computation) checked(name string) {
	c.summary.Attention.Checked = append(c.summary.Attention.Checked, name)
}

func (c *computation) customers(ctx context.Context) error {
	row, err := c.q.DashboardCustomerCounts(ctx, db.DashboardCustomerCountsParams{
		OrganizationID: c.org, Since: ts(c.from),
	})
	if err != nil {
		return err
	}
	c.summary.Figures.Customers = DashboardCustomerFigures{Total: row.Total, CreatedInRange: row.CreatedInRange}
	return nil
}

func (c *computation) instances(ctx context.Context) error {
	counts, err := c.q.DashboardInstanceCounts(ctx, db.DashboardInstanceCountsParams{
		OrganizationID: c.org, Since: ts(c.from),
	})
	if err != nil {
		return err
	}
	c.summary.Figures.Instances = DashboardInstanceFigures{
		Total:          counts.Total,
		CreatedInRange: counts.CreatedInRange,
		ByStatus: map[string]int64{
			"HEALTHY": counts.Healthy, "DEGRADED": counts.Degraded,
			"INCIDENT": counts.Incident, "MAINTENANCE": counts.Maintenance,
		},
	}

	unhealthy, err := c.q.DashboardInstancesNotHealthy(ctx, c.org)
	if err != nil {
		return err
	}
	items := make([]DashboardInstance, 0, len(unhealthy))
	for _, row := range unhealthy {
		items = append(items, DashboardInstance{
			InstanceSlug: row.Slug, InstanceName: row.Name,
			CustomerSlug: row.CustomerSlug, CustomerName: row.CustomerName, Status: row.Status,
		})
	}
	c.summary.Attention.InstancesNotHealthy = DashboardAttentionInstances{
		Count: counts.Degraded + counts.Incident + counts.Maintenance,
		Items: items,
	}
	c.checked("instancesNotHealthy")
	return nil
}

func (c *computation) meters(ctx context.Context) error {
	rows, err := c.q.DashboardMeters(ctx, c.org)
	if err != nil {
		return err
	}
	meters := make([]DashboardMeter, 0, len(rows))
	c.headline = map[string]DashboardMeter{}
	for _, row := range rows {
		m, err := meterOf(row, c.now)
		if err != nil {
			return err
		}
		meters = append(meters, m)
		if current, ok := c.headline[m.InstanceSlug]; !ok || meterWorse(m, current) {
			c.headline[m.InstanceSlug] = m
		}
	}
	// Highest ratio first; meters nothing refuses come last, by what they use.
	sort.SliceStable(meters, func(i, j int) bool {
		a, b := meters[i].Ratio, meters[j].Ratio
		switch {
		case a != nil && b != nil && *a != *b:
			return *a > *b
		case a != nil && b == nil:
			return true
		case a == nil && b != nil:
			return false
		}
		return meters[i].Used > meters[j].Used
	})

	reached := DashboardAttentionMeters{Items: []DashboardMeter{}}
	near := DashboardAttentionMeters{Items: []DashboardMeter{}}
	for _, m := range meters {
		switch {
		case m.LimitReached:
			reached.Count++
			if len(reached.Items) < topItems {
				reached.Items = append(reached.Items, m)
			}
		case m.AboveWarning:
			near.Count++
			if len(near.Items) < topItems {
				near.Items = append(near.Items, m)
			}
		}
	}
	c.summary.Saturation = meters[:min(len(meters), topMeters)]
	c.summary.Attention.LimitsReached = reached
	c.summary.Attention.NearThreshold = near
	c.checked("limitsReached")
	c.checked("nearThreshold")
	return nil
}

// meterState ranks what a meter says about its instance: refusing first, then
// warning, then nothing.
func meterState(m DashboardMeter) int {
	switch {
	case m.LimitReached:
		return 2
	case m.AboveWarning:
		return 1
	}
	return 0
}

// meterWorse is whether a should decide the standing rather than b: the worse
// state first, then the higher ratio, so a meter that refuses reports is never
// hidden by one further along an allowance nothing refuses.
func meterWorse(a, b DashboardMeter) bool {
	if sa, sb := meterState(a), meterState(b); sa != sb {
		return sa > sb
	}
	ra, rb := -1.0, -1.0
	if a.Ratio != nil {
		ra = *a.Ratio
	}
	if b.Ratio != nil {
		rb = *b.Ratio
	}
	return ra > rb
}

// meterOf reads one grant against its usage: the grant plus its allowance is
// the most a report is accepted up to; -1 on either is the unlimited sentinel.
// A periodic entitlement is read in its current window, the way the usage
// endpoints read it (period.ResolveCurrentOn, then the lazy-read rule of
// entitlementvalue.ResolveCurrentWindowUsage): a stored window that closed
// without a report counts as 0, and windowStart is the current window's. The
// warning is the report path's: a percentage of the grant, none when the
// entitlement sets no threshold.
func meterOf(row db.DashboardMetersRow, now time.Time) (DashboardMeter, error) {
	m := DashboardMeter{
		InstanceSlug: row.InstanceSlug, InstanceName: row.InstanceName,
		CustomerSlug: row.CustomerSlug, CustomerName: row.CustomerName,
		EntitlementSlug: row.EntitlementSlug, EntitlementName: row.EntitlementName,
		Unit:                    row.UnitPlural,
		LicenseName:             row.LicenseName,
		LicenseState:            row.LicenseState,
		Used:                    row.Used,
		AllowancePercent:        int(row.OveragePercent),
		WarningThresholdPercent: int(row.WarningThresholdPercent),
		WindowStart:             timePtr(row.PeriodStart),
	}
	if row.ResetPeriod != nil && row.ResetAnchor != nil {
		var storedStart *time.Time
		if row.PeriodStart.Valid {
			storedStart = ptr.To(row.PeriodStart.Time.UTC())
		}
		basis := period.NewBasis(row.StartLicenseDate.Time.UTC(), row.BillingStatus,
			pgtime.PgTimeStampToTimePtr(row.BillingAnchorAt), pgtime.PgTimeStampToTimePtr(row.LiveEndedAt))
		window, _, err := period.ResolveCurrentOn(now, storedStart,
			period.ResetPeriod(*row.ResetPeriod), period.ResetAnchor(*row.ResetAnchor), basis)
		if err != nil {
			return m, fmt.Errorf("meter %s/%s: %w", row.InstanceSlug, row.EntitlementSlug, err)
		}
		if storedStart == nil || !storedStart.Equal(window.Start) {
			m.Used = 0
		}
		start := window.Start
		m.WindowStart = &start
	}
	if row.Granted < 0 {
		return m, nil // unlimited: nothing to measure against
	}
	granted := row.Granted
	m.Granted = &granted

	var reference float64
	switch {
	case row.OveragePercent < 0:
		// An unlimited allowance: nothing refuses, the grant is only a mark.
		reference = granted
	case row.OveragePercent == 0:
		m.HardLimit = true
		reference = granted
		m.MaxAllowed = &reference
	default:
		reference = granted * (1 + float64(row.OveragePercent)/100)
		m.MaxAllowed = &reference
	}
	if reference <= 0 {
		return m, nil
	}
	ratio := m.Used / reference
	m.Ratio = &ratio
	switch {
	case m.MaxAllowed != nil && m.Used >= reference:
		m.LimitReached = true
	case row.WarningThresholdPercent > 0 &&
		m.Used >= entitlementvalue.WarningBoundary(granted, row.WarningThresholdPercent):
		m.AboveWarning = true
	}
	return m, nil
}

// standingOf is the one word for an instance, from its worst meter first and
// its activity second.
func standingOf(item DashboardInstanceReports) string {
	switch {
	case item.Headline != nil && item.Headline.LimitReached:
		return "atLimit"
	case item.Headline != nil && item.Headline.AboveWarning:
		return "watch"
	case item.Silent:
		return "silent"
	}
	return "healthy"
}

func (c *computation) usageReports(ctx context.Context) error {
	accepted, err := c.q.DashboardAcceptedReportsPerDay(ctx, db.DashboardAcceptedReportsPerDayParams{
		OrganizationID: c.org, Since: ts(c.from),
	})
	if err != nil {
		return err
	}
	rejected, err := c.q.DashboardRejectedReportsPerDay(ctx, db.DashboardRejectedReportsPerDayParams{
		OrganizationID: c.org, Since: tz(c.from),
	})
	if err != nil {
		return err
	}

	// One entry per day of the range, zeros included, so a chart draws the
	// quiet days too.
	byDay := map[string]*DashboardDayReports{}
	days := []DashboardDayReports{}
	// One bucket a calendar day, as many as the period has days, today last.
	first := startOfDay(c.now).AddDate(0, 0, 1-c.summary.Range.Days)
	for day := first; !day.After(c.now); day = day.AddDate(0, 0, 1) {
		days = append(days, DashboardDayReports{Day: day})
	}
	for i := range days {
		byDay[dayKey(days[i].Day)] = &days[i]
	}
	var totalAccepted, totalRejected int64
	for _, row := range accepted {
		totalAccepted += row.Accepted
		if d, ok := byDay[dayKey(row.Day.Time)]; ok {
			d.Accepted = row.Accepted
		}
	}
	for _, row := range rejected {
		totalRejected += row.Rejected
		if d, ok := byDay[dayKey(row.Day.Time)]; ok {
			d.Rejected = row.Rejected
		}
	}

	rows, err := c.q.DashboardReportsByInstance(ctx, db.DashboardReportsByInstanceParams{
		OrganizationID: c.org,
		Since:          ts(c.from),
		SinceTz:        tz(c.from),
		LastDay:        tz(c.now.Add(-24 * time.Hour)),
	})
	if err != nil {
		return err
	}
	byInstance := make([]DashboardInstanceReports, 0, len(rows))
	standings := map[string]int64{}
	refused := DashboardAttentionReports{Items: []DashboardInstanceReports{}}
	silent := DashboardAttentionInstances{Items: []DashboardInstance{}}
	var active int64
	for _, row := range rows {
		item := DashboardInstanceReports{
			InstanceSlug: row.Slug, InstanceName: row.Name,
			CustomerSlug: row.CustomerSlug, CustomerName: row.CustomerName,
			LicenseName: row.LicenseName, LicenseState: row.LicenseState,
			Accepted: row.Accepted, Rejected: row.Rejected, Rejected24h: row.Rejected24h,
			LastReportAt: timePtr(row.LastReportAt),
			LastReadAt:   timePtrTz(row.LastReadAt),
		}
		// An instance whose every report is refused is talking, and blocked: it
		// shows under the refusals, not as silent.
		item.Silent = item.Accepted == 0 && item.Rejected == 0 && item.LastReadAt == nil
		if head, ok := c.headline[item.InstanceSlug]; ok {
			h := head
			item.Headline = &h
		}
		item.Standing = standingOf(item)
		standings[item.Standing]++
		byInstance = append(byInstance, item)
		if item.Silent {
			silent.Count++
			if len(silent.Items) < topItems {
				silent.Items = append(silent.Items, DashboardInstance{
					InstanceSlug: item.InstanceSlug, InstanceName: item.InstanceName,
					CustomerSlug: item.CustomerSlug, CustomerName: item.CustomerName,
				})
			}
		} else {
			active++
		}
		refused.Count += item.Rejected24h
	}
	// The instances refused most in the last day, first.
	withRefusals := make([]DashboardInstanceReports, 0)
	for _, item := range byInstance {
		if item.Rejected24h > 0 {
			withRefusals = append(withRefusals, item)
		}
	}
	sort.SliceStable(withRefusals, func(i, j int) bool { return withRefusals[i].Rejected24h > withRefusals[j].Rejected24h })
	refused.Items = withRefusals[:min(len(withRefusals), topItems)]

	c.summary.UsageReports = DashboardUsageReports{PerDay: days, ByInstance: byInstance}
	c.summary.Figures.UsageReports = DashboardUsageReportFigures{
		Accepted: totalAccepted, Rejected: totalRejected, Rejected24h: refused.Count,
	}
	c.summary.Figures.Instances.ActiveInRange = active
	c.summary.Figures.Instances.SilentInRange = silent.Count
	c.summary.Figures.Instances.ByStanding = DashboardStandingCounts{
		AtLimit: standings["atLimit"], Watch: standings["watch"],
		Silent: standings["silent"], Healthy: standings["healthy"],
	}
	c.summary.Attention.RejectedReports24h = refused
	c.summary.Attention.SilentInstances = silent
	c.checked("rejectedReports24h")
	c.checked("silentInstances")
	return nil
}

func (c *computation) featureFlags(ctx context.Context) error {
	if !c.query.Visibility.FeatureFlags {
		return nil
	}
	rows, err := c.q.DashboardFlagEvaluations(ctx, db.DashboardFlagEvaluationsParams{
		OrganizationID: c.org, Since: tz(c.from),
	})
	if err != nil {
		return err
	}
	block := &DashboardFeatureFlags{PerFlag: make([]DashboardFlagEvaluations, 0, len(rows))}
	for _, row := range rows {
		block.Total++
		if row.Enabled {
			block.Enabled++
		}
		block.Evaluations += row.Evaluations
		if row.Evaluations == 0 {
			block.NotEvaluated++
		}
		block.PerFlag = append(block.PerFlag, DashboardFlagEvaluations{
			Slug: row.Slug, Name: row.Name, Enabled: row.Enabled, Evaluations: row.Evaluations,
		})
	}
	c.summary.FeatureFlags = block
	return nil
}

func (c *computation) licenses(ctx context.Context) error {
	mixRows, err := c.q.DashboardLicenseMix(ctx, c.org)
	if err != nil {
		return err
	}
	block := &DashboardLicenses{Mix: []DashboardLicenseFamilyMix{}, Archived: []DashboardArchivedVersion{}}
	index := map[string]int{}
	for _, row := range mixRows {
		i, ok := index[row.FamilySlug]
		if !ok {
			block.Mix = append(block.Mix, DashboardLicenseFamilyMix{FamilySlug: row.FamilySlug, Versions: []DashboardLicenseVersionMix{}})
			i = len(block.Mix) - 1
			index[row.FamilySlug] = i
		}
		block.Mix[i].Instances += row.Instances
		block.Mix[i].Versions = append(block.Mix[i].Versions, DashboardLicenseVersionMix{
			Slug: row.LicenseSlug, Name: row.Name, Version: row.Version,
			LifecycleState: row.LifecycleState, IsDefault: row.IsDefault, Instances: row.Instances,
		})
	}

	in30 := c.now.AddDate(0, 0, soonDays)
	in180 := c.now.AddDate(0, 0, endingHorizonDays)
	counts, err := c.q.DashboardLicensesEndingCounts(ctx, db.DashboardLicensesEndingCountsParams{
		OrganizationID: c.org, Now: ts(c.now), In30Days: ts(in30), In180Days: ts(in180),
	})
	if err != nil {
		return err
	}
	endingRows, err := c.q.DashboardLicensesEnding(ctx, db.DashboardLicensesEndingParams{
		OrganizationID: c.org, Now: ts(c.now), In180Days: ts(in180),
	})
	if err != nil {
		return err
	}
	ending := DashboardLicensesEnding{Within30Days: counts.Within30Days, Within180Days: counts.Within180Days, Items: []DashboardLicenseEnding{}}
	soon := DashboardAttentionLicenses{Count: counts.Within30Days, Items: []DashboardLicenseEnding{}}
	for _, row := range endingRows {
		item := DashboardLicenseEnding{
			InstanceSlug: row.Slug, InstanceName: row.Name,
			CustomerSlug: row.CustomerSlug, CustomerName: row.CustomerName,
			LicenseName: row.LicenseName, EndsAt: row.EndLicenseDate.Time.UTC(),
		}
		if c.query.Visibility.Billing {
			item.BillingStatus = optional(row.BillingStatus)
			item.CancelAtPeriodEnd = row.CancelAtPeriodEnd
		}
		ending.Items = append(ending.Items, item)
		if item.EndsAt.Before(in30) && len(soon.Items) < topItems {
			soon.Items = append(soon.Items, item)
		}
	}
	block.Ending = ending

	archivedRows, err := c.q.DashboardArchivedVersions(ctx, c.org)
	if err != nil {
		return err
	}
	archived := DashboardAttentionArchived{Items: []DashboardArchivedVersion{}}
	for _, row := range archivedRows {
		item := DashboardArchivedVersion{
			InstanceSlug: row.Slug, InstanceName: row.Name,
			CustomerSlug: row.CustomerSlug, CustomerName: row.CustomerName,
			LicenseName: row.LicenseName, Version: row.Version, FamilySlug: row.FamilySlug,
			DefaultLicenseName: optional(row.DefaultLicenseName),
		}
		block.Archived = append(block.Archived, item)
		archived.Count++
		if len(archived.Items) < topItems {
			archived.Items = append(archived.Items, item)
		}
	}

	c.summary.Licenses = *block
	c.summary.Attention.LicensesEnding30d = soon
	c.summary.Attention.ArchivedVersions = archived
	c.checked("licensesEnding30d")
	c.checked("archivedVersions")
	return nil
}

func (c *computation) zones(ctx context.Context) error {
	if !c.query.Visibility.DeploymentZones || !c.query.Visibility.Releases {
		return nil
	}
	rows, err := c.q.DashboardZones(ctx, c.org)
	if err != nil {
		return err
	}
	zones := make([]DashboardZone, 0, len(rows))
	behind := DashboardAttentionZones{Items: []DashboardZone{}}
	for _, row := range rows {
		zone := DashboardZone{
			Slug: row.Slug, Name: row.Name, Type: row.Type,
			ReleaseVersion: row.ReleaseVersion, DeployedAt: timePtr(row.DeployedAt), DeployedBy: row.DeployedBy,
			Instances: row.Instances, ReleasesBehind: row.ReleasesBehind,
		}
		zones = append(zones, zone)
		if zone.ReleasesBehind > 0 {
			behind.Count++
			if len(behind.Items) < topItems {
				behind.Items = append(behind.Items, zone)
			}
		}
	}
	c.summary.Zones = zones
	c.summary.Attention.ZonesBehind = behind
	c.checked("zonesBehind")
	return nil
}

func (c *computation) integrations(ctx context.Context) error {
	v := c.query.Visibility
	if !v.Tokens && !v.PublishableKeys && !v.Connectors {
		return nil
	}
	block := &DashboardIntegrations{}
	if v.Tokens {
		in30 := ts(c.now.AddDate(0, 0, soonDays))
		counts, err := c.q.DashboardTokenCounts(ctx, db.DashboardTokenCountsParams{
			OrganizationID: c.org, Now: ts(c.now), In30Days: in30,
		})
		if err != nil {
			return err
		}
		expiringRows, err := c.q.DashboardTokensExpiring(ctx, db.DashboardTokensExpiringParams{
			OrganizationID: c.org, Now: ts(c.now), In30Days: in30,
		})
		if err != nil {
			return err
		}
		tokens := &DashboardTokens{
			ServiceAccounts:      counts.ServiceAccounts,
			ActiveTokens:         counts.ActiveTokens,
			TokensExpiring30Days: counts.TokensExpiring30Days,
			TokensWithoutExpiry:  counts.TokensWithoutExpiry,
			TokensExpiring:       make([]DashboardTokenExpiring, 0, len(expiringRows)),
		}
		for _, row := range expiringRows {
			var accountSlug string
			if row.ServiceAccountSlug != nil {
				accountSlug = *row.ServiceAccountSlug
			}
			tokens.TokensExpiring = append(tokens.TokensExpiring, DashboardTokenExpiring{
				Name: row.Name, Slug: row.Slug, ExpiresAt: row.ExpiresAt.Time.UTC(),
				ServiceAccountSlug: accountSlug, ServiceAccountName: row.ServiceAccountName,
			})
		}
		block.Tokens = tokens
		c.summary.Attention.TokensExpiring30d = DashboardAttentionTokens{
			Count: counts.TokensExpiring30Days, Items: tokens.TokensExpiring,
		}
		c.checked("tokensExpiring30d")
	}
	if v.PublishableKeys {
		keys, err := c.q.DashboardPublishableKeyCounts(ctx, c.org)
		if err != nil {
			return err
		}
		block.PublishableKeys = &DashboardPublishableKeys{Count: keys.Count, LastUsedAt: timePtr(keys.LastUsedAt)}
	}
	if v.Connectors {
		rows, err := c.q.DashboardConnectors(ctx, c.org)
		if err != nil {
			return err
		}
		connectors := &DashboardConnectors{Items: make([]DashboardConnector, 0, len(rows))}
		for _, row := range rows {
			connectors.Items = append(connectors.Items, DashboardConnector{
				Name: row.Name, Activated: row.Activated, ActivatedAt: timePtrTz(row.ActivatedAt),
			})
		}
		block.Connectors = connectors
	}
	c.summary.Integrations = block
	return nil
}

func (c *computation) billing(ctx context.Context) error {
	if !c.query.Visibility.Billing {
		return nil
	}
	subs, err := c.q.DashboardSubscriptions(ctx, c.org)
	if err != nil {
		return err
	}
	monthStart := time.Date(c.now.Year(), c.now.Month(), 1, 0, 0, 0, 0, time.UTC)
	invoiced, err := c.q.DashboardInvoicedThisMonth(ctx, db.DashboardInvoicedThisMonthParams{
		OrganizationID: c.org, Now: ts(c.now), MonthStart: ts(monthStart),
	})
	if err != nil {
		return err
	}
	block := &DashboardBilling{
		Subscriptions:     DashboardSubscriptions{Active: subs.Active, Trial: subs.Trial, PastDue: subs.PastDue, Canceled: subs.Canceled},
		InvoicedThisMonth: make([]DashboardInvoicedCurrency, 0, len(invoiced)),
	}
	for _, row := range invoiced {
		block.InvoicedThisMonth = append(block.InvoicedThisMonth, DashboardInvoicedCurrency{
			Currency: row.Currency, Invoices: row.Invoices, TotalMinor: row.TotalMinor, Paid: row.Paid, Overdue: row.Overdue,
		})
	}
	c.summary.Billing = block
	return nil
}

func ts(t time.Time) pgtype.Timestamp   { return pgtype.Timestamp{Time: t, Valid: true} }
func tz(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }
func startOfDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}
func dayKey(t time.Time) string { return t.UTC().Format(time.DateOnly) }

func timePtr(t pgtype.Timestamp) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time.UTC()
	return &v
}

func timePtrTz(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time.UTC()
	return &v
}

// optional turns the empty string a COALESCEd subquery answers into an absent
// value.
func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
