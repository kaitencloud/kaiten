package reportentitlementusagemetric

import (
	"context"
	"errors"
	"strconv"
	"sync"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

var aiMetrics struct {
	once         sync.Once
	reports      metric.Int64Counter
	charged      metric.Float64Counter
	unauthorized metric.Int64Counter
	overdrawn    metric.Int64Counter
}

func recordAIReport(ctx context.Context, cmd *Command, response *schema.EntitlementUsage, err error) {
	if cmd.AI == nil {
		return
	}
	aiMetrics.once.Do(func() {
		meter := otel.Meter("kaiten.ai_usage")
		aiMetrics.reports, _ = meter.Int64Counter("ai_usage_report_total")
		aiMetrics.charged, _ = meter.Float64Counter("ai_credits_charged_total")
		aiMetrics.unauthorized, _ = meter.Int64Counter("ai_inference_unauthorized_total")
		aiMetrics.overdrawn, _ = meter.Int64Counter("ai_overdrawn_commits_total")
	})
	outcome := "accepted"
	if err != nil {
		outcome = "error"
		var problem *apierrors.Error
		if errors.As(err, &problem) {
			switch problem.Code {
			case "ReportEntitlementUsageMetric.ThresholdExceeded", "ReportEntitlementUsageMetric.UnknownModel", "ReportEntitlementUsageMetric.ModelNotAuthorized":
				outcome = "refused"
			case "ReportEntitlementUsageMetric.TransactionIdReused":
				outcome = "conflict"
			}
		}
	}
	if response != nil && response.Replayed {
		outcome = "replayed"
	}
	if aiMetrics.reports != nil {
		aiMetrics.reports.Add(ctx, 1, metric.WithAttributes(attribute.String("phase", cmd.AI.Phase), attribute.String("outcome", outcome)))
	}
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(attribute.String("ai.phase", cmd.AI.Phase))
	if cmd.AI.Model != nil {
		span.SetAttributes(attribute.String("ai.model", *cmd.AI.Model))
	}
	if err != nil || response == nil || response.AI == nil || response.Replayed {
		return
	}
	ai := response.AI
	if ai.Credits.Charged != nil {
		value, parseErr := strconv.ParseFloat(*ai.Credits.Charged, 64)
		if parseErr == nil {
			span.SetAttributes(attribute.Float64("ai.credits_charged", value))
			if aiMetrics.charged != nil {
				aiMetrics.charged.Add(ctx, value)
			}
		}
	}
	if ai.Authorized != nil && !*ai.Authorized && aiMetrics.unauthorized != nil {
		aiMetrics.unauthorized.Add(ctx, 1)
	}
	for _, warning := range ai.Warnings {
		if warning == "OVERDRAWN" && aiMetrics.overdrawn != nil {
			aiMetrics.overdrawn.Add(ctx, 1)
		}
	}
}
