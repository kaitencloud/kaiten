package main

import (
	"context"
	"fmt"
	"log"

	"github.com/danielgtaylor/huma/v2/humacli"
	"github.com/spf13/cobra"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/server"
)

func main() {
	var srv *server.Server
	var ephemeralPort uint

	cli := humacli.New(func(hooks humacli.Hooks, _ *struct{}) {
		var err error
		srv, err = server.New(context.Background(), server.Dependencies{
			Auth:         nil,
			UserProvider: nil,
			DB:           nil,
		}, config.Config{
			Server: config.Server{Port: ephemeralPort},
		})
		if err != nil {
			log.Fatalf("Error initializing server: %v", err)
		}

		hooks.OnStart(func() {
			err = srv.Start()
			if err != nil {
				log.Fatalf("Error starting server: %v", err)
			}
		})
	})

	// OpenAPI 3.1 is the only emitted dialect.
	openAPICmd := &cobra.Command{
		Use:   "openapi",
		Short: "Print the OpenAPI 3.1 spec",
		RunE: func(_ *cobra.Command, _ []string) error {
			b, err := srv.API().OpenAPI().YAML()
			if err != nil {
				return err
			}

			fmt.Print(string(b))
			return nil
		},
	}

	// The Platform API is its own document, not a section of the Core one, so it
	// is its own command and its own committed artifact
	// (app/platform-openapi.yaml). Same server, same nil dependencies: both
	// documents are built by the same server.New the runtime uses, so neither can
	// drift from what is actually registered.
	platformOpenAPICmd := &cobra.Command{
		Use:   "platform-openapi",
		Short: "Print the Platform API's OpenAPI 3.1 spec",
		RunE: func(_ *cobra.Command, _ []string) error {
			b, err := srv.PlatformAPI().OpenAPI().YAML()
			if err != nil {
				return err
			}

			fmt.Print(string(b))
			return nil
		},
	}

	cli.Root().AddCommand(openAPICmd)
	cli.Root().AddCommand(platformOpenAPICmd)

	cli.Run()
}
