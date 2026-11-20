package patchinstance

import "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"

// Command carries the partial instance patch. Each field is optional: a nil
// pointer means "leave untouched", a non-nil pointer means "set to this value".
type Command struct {
	Status         *schema.InstanceStatus
	LifecycleStage *string
	// Metadata is a first-level merge patch: each key is set, a nil value
	// removes the key, and keys absent from it are kept. Nil or empty
	// changes nothing.
	Metadata map[string]any
}
