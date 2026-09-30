package patchinstance

import "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"

// Command carries the partial instance patch. Each field is optional: a nil
// pointer means "leave untouched", a non-nil pointer means "set to this value".
type Command struct {
	Status         *schema.InstanceStatus
	LifecycleStage *string
}
