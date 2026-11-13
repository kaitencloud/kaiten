package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	ModelCreated = events.New("MODEL_CREATED", "com.kaiten.model.v1.created")
	ModelUpdated = events.New("MODEL_UPDATED", "com.kaiten.model.v1.updated")
	ModelDeleted = events.New("MODEL_DELETED", "com.kaiten.model.v1.deleted")
)
