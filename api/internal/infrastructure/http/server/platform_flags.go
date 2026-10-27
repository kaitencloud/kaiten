package server

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/platformflags"
)

// setupPlatformFlags selects ONE operator-trusted source independently of
// Metered.Enabled and driver-provided usage reporters. A configured remote
// authority never falls back to local/customer flags on denial or source loss.
func (s *Server) setupPlatformFlags(ctx context.Context) error {
	if s.deps.PlatformFlags != nil {
		return nil
	}
	source, err := s.cfg.Metered.ResolvePlatformOrgID()
	if err != nil {
		return fmt.Errorf("resolve platform flag organization: %w", err)
	}
	if source == uuid.Nil {
		return nil // no trusted source: closed, including platform self-evaluation
	}
	remote := strings.TrimSpace(s.cfg.Metered.APIURL) != "" || strings.TrimSpace(s.cfg.Metered.TokenFile) != ""
	if !remote {
		if s.deps.DB != nil {
			s.deps.PlatformFlags = platformflags.New(s.deps.DB, source)
		}
		return nil
	}
	if strings.TrimSpace(s.cfg.Metered.APIURL) == "" || strings.TrimSpace(s.cfg.Metered.TokenFile) == "" {
		return fmt.Errorf("remote platform flags require both metered.api_url and metered.token_file")
	}
	// Reuse only the concrete reporter constructed from these operator settings,
	// never a driver's arbitrary metering implementation. Do not copy commercial
	// Entitled/ConfigValue self-exemptions into platform feature flag evaluation.
	if reporter := s.usageReporter; reporter != nil {
		s.deps.PlatformFlags = reporter
		return nil
	}
	reporter, err := dogfooding.NewReporterFor(ctx, s.cfg.Metered)
	if err != nil {
		return err
	}
	s.flagReporter = reporter // this flag-only client's shutdown belongs to us
	s.deps.PlatformFlags = reporter
	return nil
}
