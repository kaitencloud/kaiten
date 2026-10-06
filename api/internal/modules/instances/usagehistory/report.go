// Package usagehistory serves the usage journal (usage_ledger) back to its
// readers: one pair's reports page by page, and the CSV and NDJSON exports of
// a pair or of a whole organization. It holds what the three use cases share
// -- the item shape, how a requested range is resolved against the retention,
// and the export encoders -- and none of their transport.
//
// Every read here is a read: no outbox event and no audit row, so that paging
// through a year of reports does not write a row per page.
package usagehistory

import (
	"bytes"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

// UsageReport is one accepted usage report as the journal recorded it. Decimals are
// strings, exact to the digit the journal stores.
type UsageReport struct {
	InstanceID        uuid.UUID      `json:"instanceId" format:"uuid" doc:"The instance the report was made for. It may since have been deleted."`
	EntitlementID     uuid.UUID      `json:"entitlementId" format:"uuid" doc:"The entitlement the report was made for. It may since have been deleted."`
	ReportSeq         int64          `json:"reportSeq" doc:"Position of the report among the pair's accepted reports, from 1, without gaps" example:"42"`
	ReportedAt        time.Time      `json:"reportedAt" doc:"When the server accepted the report (UTC, millisecond precision)" example:"2026-10-05T08:00:00.000Z"`
	Behavior          string         `json:"behavior" doc:"append adds the value through the aggregation method; set overwrites the counter" enum:"append,set"`
	AggregationMethod string         `json:"aggregationMethod" doc:"The entitlement's aggregation method when the report was accepted" example:"SUM"`
	ReportedValue     string         `json:"reportedValue" doc:"The value as sent: a delta for append, an absolute value for set" example:"600"`
	ValueBefore       string         `json:"valueBefore" doc:"The counter before the report, after any window reset" example:"0"`
	ValueAfter        string         `json:"valueAfter" doc:"The counter after the report" example:"600"`
	Delta             string         `json:"delta" doc:"valueAfter minus valueBefore; negative for a set that lowered the counter" example:"600"`
	OverageDelta      string         `json:"overageDelta" doc:"How much the usage above limitValue moved: max(0, valueAfter - limitValue) - max(0, valueBefore - limitValue). 0 when unlimited." example:"0"`
	EventCountAfter   int32          `json:"eventCountAfter" doc:"Reports counted in the window after this one" example:"1"`
	WindowStart       *time.Time     `json:"windowStart,omitempty" doc:"Start of the usage window the report counted in (inclusive). Null for a lifetime entitlement."`
	WindowEnd         *time.Time     `json:"windowEnd,omitempty" doc:"End of the usage window the report counted in (exclusive). Null for a lifetime entitlement."`
	LimitValue        *string        `json:"limitValue,omitempty" doc:"The limit in force when the report was accepted. Null when unlimited." example:"1000"`
	OveragePercent    *int16         `json:"overagePercent,omitempty" doc:"The overage allowed above limitValue, in percent, when the report was accepted. Null when unlimited." example:"50"`
	LicenseID         uuid.UUID      `json:"licenseId" format:"uuid" doc:"The instance's licence when the report was accepted"`
	TransactionID     *string        `json:"transactionId,omitempty" doc:"The report's idempotency key, when it was sent with one" example:"llm-call-9f2c:tokens"`
	Properties        map[string]any `json:"properties,omitempty" doc:"The report's metadata, when it was stored"`

	// organizationID only appears in the CSV export, whose columns carry it.
	organizationID uuid.UUID
}

// fromRow maps one journal row. The two list queries return the same columns,
// so an organization row converts to a pair row field for field.
func fromRow(row db.ListPairUsageReportsRow) UsageReport {
	report := UsageReport{
		InstanceID:        row.InstanceID,
		EntitlementID:     row.EntitlementID,
		ReportSeq:         row.ReportSeq,
		ReportedAt:        utc(row.ReportedAt),
		Behavior:          row.Behavior,
		AggregationMethod: row.AggregationMethod,
		ReportedValue:     row.ReportedValue,
		ValueBefore:       row.ValueBefore,
		ValueAfter:        row.ValueAfter,
		Delta:             row.Delta,
		OverageDelta:      row.OverageDelta,
		EventCountAfter:   row.EventCountAfter,
		WindowStart:       utcPtr(row.WindowStart),
		WindowEnd:         utcPtr(row.WindowEnd),
		LicenseID:         row.LicenseID,
		TransactionID:     row.TransactionID,
		organizationID:    row.OrganizationID,
	}
	if row.LimitValue != "" {
		limit, percent := row.LimitValue, row.OveragePercent
		report.LimitValue, report.OveragePercent = &limit, &percent
	}
	if len(row.Properties) > 0 {
		// Numbers stay json.Number, so they are re-encoded digit for digit.
		decoder := json.NewDecoder(bytes.NewReader(row.Properties))
		decoder.UseNumber()
		var properties map[string]any
		if decoder.Decode(&properties) == nil {
			report.Properties = properties
		}
	}
	return report
}

func utc(ts pgtype.Timestamp) time.Time {
	return ts.Time.UTC()
}

func utcPtr(ts pgtype.Timestamp) *time.Time {
	if !ts.Valid {
		return nil
	}
	t := ts.Time.UTC()
	return &t
}

func timestamp(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t.UTC(), Valid: true}
}
