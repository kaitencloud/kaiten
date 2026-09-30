package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	ReleaseCreated = events.New("RELEASE_CREATED", "com.kaiten.release.v1.created")
	ReleaseDeleted = events.New("RELEASE_DELETED", "com.kaiten.release.v1.deleted")
)
