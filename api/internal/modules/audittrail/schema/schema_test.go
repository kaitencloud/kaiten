package schema_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/schema"
)

func TestActorOf(t *testing.T) {
	id := uuid.New()
	name, system, person := "Ada", "system:kaiten", "user_2abc"
	require.Nil(t, schema.ActorOf(nil, nil, "", nil), "an entry recorded before actors were")
	require.Equal(t, &schema.Actor{ID: id, Name: "Ada", Kind: schema.ActorUser}, schema.ActorOf(&id, &name, "human", &person))
	require.Equal(t, schema.ActorService, schema.ActorOf(&id, &name, "machine", &person).Kind)
	require.Equal(t, &schema.Actor{ID: id, Name: "Kaiten (system)", Kind: schema.ActorSystem}, schema.ActorOf(&id, &name, "machine", &system))
}
