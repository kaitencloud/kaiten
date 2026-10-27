// Package getaiusagecapabilities reads startup-fixed deployment readiness. It
// neither evaluates customer flags nor grants permission to consume a pool.
package getaiusagecapabilities

import "github.com/kaitencloud/kaiten/api/internal/shared/aiusage"

type (
	Capabilities struct {
		Enabled bool `json:"enabled"`
	}
	UseCase struct{ Policy aiusage.Policy }
)

func (u UseCase) Read() Capabilities { return Capabilities{Enabled: u.Policy.Enabled} }
