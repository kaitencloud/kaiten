package getmanifest

import (
	"context"
	"encoding/json"
	"math"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider currentuser.Provider
	Queries      *db.Queries
}

type ManifestFlag struct {
	Key          string  `json:"key"`
	Name         string  `json:"name,omitempty"`
	Type         string  `json:"type"`
	Description  *string `json:"description,omitempty"`
	DefaultValue any     `json:"defaultValue"`
}

type ManifestEnvelope struct {
	Flags []ManifestFlag `json:"flags"`
}

type UseCase struct {
	deps       Deps
	repository Repository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries),
	}
}

func (h *UseCase) Execute(ctx context.Context) (*ManifestEnvelope, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	flags, err := h.repository.GetAllFeatureFlags(ctx, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	manifestFlags := make([]ManifestFlag, 0, len(flags))
	for _, flag := range flags {
		fallbackValue, ok := flag.Metadata["fallback_value"]
		if !ok {
			continue
		}

		manifestFlags = append(manifestFlags, ManifestFlag{
			Key:          flag.Slug,
			Name:         flag.Name,
			Type:         inferManifestType(flag.Type, fallbackValue),
			Description:  flag.Description,
			DefaultValue: fallbackValue,
		})
	}

	return &ManifestEnvelope{Flags: manifestFlags}, nil
}

func manifestType(flagType string) string {
	if flagType == "number" {
		return "integer"
	}

	return flagType
}

func inferManifestType(flagType string, fallbackValue any) string {
	if flagType != "number" {
		return manifestType(flagType)
	}

	switch value := fallbackValue.(type) {
	case int, int8, int16, int32, int64:
		return "integer"
	case uint, uint8, uint16, uint32, uint64, uintptr:
		return "integer"
	case float32:
		if isWholeNumber(float64(value)) {
			return "integer"
		}
		return "float"
	case float64:
		if isWholeNumber(value) {
			return "integer"
		}
		return "float"
	case json.Number:
		if _, err := value.Int64(); err == nil {
			return "integer"
		}
		if _, err := value.Float64(); err == nil {
			return "float"
		}
	}

	return manifestType(flagType)
}

func isWholeNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value == math.Trunc(value)
}
