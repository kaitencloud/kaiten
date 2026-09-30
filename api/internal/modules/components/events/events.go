package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	ComponentCreated = events.New("COMPONENT_CREATED", "com.kaiten.component.v1.created")
	ComponentUpdated = events.New("COMPONENT_UPDATED", "com.kaiten.component.v1.updated")
	ComponentDeleted = events.New("COMPONENT_DELETED", "com.kaiten.component.v1.deleted")
)
