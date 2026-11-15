package schema

import "time"

type AiInference struct {
	TransactionID    string     `json:"transactionId"`
	Status           string     `json:"status" enum:"RESERVED,COMMITTED,RELEASED,EXPIRED"`
	ReportedAt       time.Time  `json:"reportedAt"`
	CommittedAt      *time.Time `json:"committedAt,omitempty"`
	ExpiresAt        *time.Time `json:"expiresAt,omitempty"`
	Model            string     `json:"model"`
	ModelSlug        *string    `json:"modelSlug,omitempty"`
	RequestType      string     `json:"requestType" enum:"COMPLETION,EMBEDDING,IMAGE_GENERATION,AUDIO,VIDEO"`
	RequestStatus    *string    `json:"requestStatus,omitempty"`
	Usage            AiUsage    `json:"usage"`
	Authorized       *bool      `json:"authorized,omitempty"`
	DenialReason     *string    `json:"denialReason,omitempty"`
	ConversionRuleID *string    `json:"conversionRuleId,omitempty"`
	Credits          AiCredits  `json:"credits"`
	ValueBefore      *float64   `json:"valueBefore,omitempty"`
	ValueAfter       *float64   `json:"valueAfter,omitempty"`
	WindowStart      *time.Time `json:"windowStart,omitempty"`
}

type AiInferencePage struct {
	Items      []AiInference `json:"items"`
	NextCursor *string       `json:"nextCursor,omitempty"`
	HasMore    bool          `json:"hasMore"`
}

type AiReservations struct {
	Items []AiInference `json:"items"`
}
