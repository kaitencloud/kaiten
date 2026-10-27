package localai

import (
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

func localAIFlag(tenantID uuid.UUID) schema.FeatureFlag {
	return schema.FeatureFlag{
		ID:   uuid.Nil,
		Slug: "ai-credits", Name: "AI credits", Type: "boolean", Enabled: true,
		Metadata:    map[string]any{"fallback_value": false},
		Description: ptr.To("Local workshop rollout only; all other organizations default to off."),
		EventName:   "ai-credits.evaluated",
		Variants: []schema.Variant{
			{Name: "off", Value: false, Description: "AI is unavailable"},
			{Name: "on", Value: true, Description: "AI is available to the local Sushi organization"},
		},
		DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("off")},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Local Sushi organization", fmt.Sprintf("organizationId == '%s'", tenantID), "on"),
		},
	}
}
