package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/server"
	"github.com/kaitencloud/kaiten/api/internal/platform/auth"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/pkg/otelcommon"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	logger := otelcommon.NewLogger("warn", "json")
	slog.SetDefault(logger)

	// Load configuration (no more global variable)
	cfg, err := config.LoadConfig()
	if err != nil {
		slog.Error("failed to load config", slog.String("error", err.Error()))
		os.Exit(1)
	}

	logger = otelcommon.NewLogger(cfg.Logging.Level, cfg.Logging.Format)
	slog.SetDefault(logger)

	// Initialize OpenTelemetry
	if err := setupTelemetry(ctx, cfg); err != nil {
		slog.Error("failed to setup telemetry", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer func() {
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		if err := otelcommon.Shutdown(shutdownCtx); err != nil {
			slog.Error("failed to shutdown telemetry", slog.String("error", err.Error()))
		}
	}()

	pool, err := setupDatabase(cfg)
	if err != nil {
		slog.Error("failed to setup database", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer pool.Close()

	// The Core authenticator, and only it. It holds no signing key at all, so the
	// public port has no code path that turns a platform credential into a
	// principal.
	//
	// Its counterpart is not built here and cannot be: authenticating a `ksm_` is a
	// database read through the identity module's credential cache, so the server
	// builds it from the application it constructs -- see
	// server.Dependencies.PlatformAuth. There is no platform signing key to pass any
	// more either; the JWT exchange it verified is gone.
	authenticator := auth.New()

	userProvider := &currentuser.ContextUserProvider{}

	app, err := server.New(ctx, server.Dependencies{
		Auth:         authenticator,
		UserProvider: userProvider,
		DB:           pool,
		Logger:       logger,
	}, *cfg)
	if err != nil {
		slog.Error("failed to initialize server", slog.String("error", err.Error()))
		os.Exit(1)
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		// One signal, both listeners: Stop drains the Core and Platform HTTP servers
		// before the application's workers are closed.
		slog.Info("shutting down server...")
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer shutdownCancel()
		if err := app.Stop(shutdownCtx); err != nil {
			slog.Error("failed to stop server", slog.String("error", err.Error()))
		}
		cancel()
	}()

	// Both ports are logged because both have to be reachable by something, and by
	// different somethings: the core port through the gateway, the platform port
	// from inside the cluster only.
	slog.Info("starting server",
		slog.Uint64("core_port", uint64(cfg.Server.Port)),
		slog.Uint64("platform_port", uint64(cfg.Server.PlatformPort)))
	err = app.Start()
	if err != nil {
		slog.Error("server error", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func setupTelemetry(ctx context.Context, cfg *config.Config) error {
	return otelcommon.InitTracer(ctx, otelcommon.Config{
		Enabled:         cfg.Otel.Enabled,
		Endpoint:        cfg.Otel.Endpoint,
		MetricsEndpoint: cfg.Otel.MetricsEndpoint,
		ServiceName:     cfg.Otel.ServiceName,
		Insecure:        cfg.Otel.Insecure,
		Authorization:   cfg.Otel.Authorization,
		SamplingRatio:   cfg.Otel.TracesSamplingRatio,
	})
}

// setupDatabase connects to the database. Migrations are applied out of band by
// kaiten-admin-tools before this binary starts; readiness gates on the schema
// being current instead -- see server.setupApp's ReadinessProbe wiring.
func setupDatabase(cfg *config.Config) (*pgxpool.Pool, error) {
	return database.ConnectDB(cfg.Database.ConnectionString)
}
