package events

import (
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
)

var (
	FeatureFlagCreated   = events.New("FEATURE_FLAG_CREATED", "com.kaiten.feature_flag.v1.created")
	FeatureFlagUpdated   = events.New("FEATURE_FLAG_UPDATED", "com.kaiten.feature_flag.v1.updated")
	FeatureFlagDeleted   = events.New("FEATURE_FLAG_DELETED", "com.kaiten.feature_flag.v1.deleted")
	FeatureFlagEvaluated = events.New("FEATURE_FLAG_EVALUATED", "com.kaiten.feature_flag.v1.evaluated")
)

// FlagEvaluationAudit is the data carried by a FEATURE_FLAG_EVALUATED outbox event.
// It deliberately excludes the evaluation context (targeting key, user attributes)
// so that no PII or secret data is written to the audit trail.
type FlagEvaluationAudit struct {
	OrganizationID    uuid.UUID
	FlagSlug          string
	FlagID            uuid.UUID
	ResolutionDetails openfeature.ResolutionDetails
}

// EvaluationPublisher is the interface handlers call to fire-and-forget an audit event
// after each flag evaluation.
type EvaluationPublisher interface {
	Publish(event FlagEvaluationAudit)
}
