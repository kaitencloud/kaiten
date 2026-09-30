package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	CustomerCreated          = events.New("CUSTOMER_CREATED", "com.kaiten.customer.v1.created")
	CustomerUpdated          = events.New("CUSTOMER_UPDATED", "com.kaiten.customer.v1.updated")
	CustomerDeleted          = events.New("CUSTOMER_DELETED", "com.kaiten.customer.v1.deleted")
	CustomerCreationRejected = events.New("CUSTOMER_CREATION_REJECTED", "com.kaiten.customer.v1.creation_rejected")
)
