package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/google/uuid"
	"github.com/spf13/cobra"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createplatformtoken"
	identityschema "github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/pkg/secretfile"
)

// This command is local bootstrap policy over the existing issuer, not a second
// issuer or an API. No invalid/ambiguous validation result permits replacement.
func buildLocalPlatformTokenEnsureCmd() *cobra.Command {
	var name, scopes, outputFile string
	cmd := &cobra.Command{
		Use: "ensure-local", Short: "Validate/preserve a non-expiring local credential, or create the first one",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if strings.TrimSpace(name) == "" || outputFile == "" {
				return errors.New("--name and --output-file are required")
			}
			parsed, err := parseScopes(scopes)
			if err != nil {
				return err
			}
			plaintext, readErr := secretfile.Read(outputFile)
			if readErr != nil && !errors.Is(readErr, os.ErrNotExist) {
				return fmt.Errorf("cannot read local credential file: %w", readErr)
			}
			app, cleanup, err := openApplication(cmd.Context())
			if err != nil {
				return err
			}
			defer cleanup()
			if readErr == nil {
				if err := validateLocalPlatformToken(cmd.Context(), app.InProcess(), plaintext, name, parsed); err != nil {
					return err
				}
				_, err = fmt.Fprintln(cmd.ErrOrStderr(), "Local platform credential validated; unchanged")
				return err
			}
			plaintext, err = mintPlatformToken(cmd.Context(), app, &createplatformtoken.Command{
				Name: strings.TrimSpace(name), Scopes: parsed,
			})
			if err != nil {
				return err
			}
			return emitCredential(cmd.OutOrStdout(), plaintext, outputFile)
		},
	}
	cmd.Flags().StringVar(&name, "name", "", "Local credential name (required)")
	cmd.Flags().StringVar(&scopes, "scopes", "", "Exact local scope set (required)")
	cmd.Flags().StringVar(&outputFile, "output-file", "", "Private local credential file (required)")
	return cmd
}

type localPlatformTokenValidator interface {
	ValidatePlatformToken(context.Context, string) (uuid.UUID, []string, bool)
	ListPlatformTokens(context.Context) ([]identityschema.PlatformToken, error)
}

func validateLocalPlatformToken(ctx context.Context, verifier localPlatformTokenValidator, plaintext, name string, scopes []string) error {
	id, _, ok := verifier.ValidatePlatformToken(ctx, plaintext)
	if !ok {
		return errors.New("local credential could not be validated; no rotation performed. Check database readiness; if stale, explicitly run task credentials:rotate")
	}
	rows, err := verifier.ListPlatformTokens(ctx)
	if err != nil {
		return fmt.Errorf("cannot verify local credential policy: %w", err)
	}
	for _, row := range rows {
		if row.ID == id && row.Name == strings.TrimSpace(name) && row.ExpiresAt == nil && row.RevokedAt == nil && equalScopeSets(row.Scopes, scopes) {
			return nil
		}
	}
	return errors.New("local credential name/scopes/expiry do not match local policy; no rotation performed. Explicitly run task credentials:rotate to recover")
}

func equalScopeSets(a, b []string) bool {
	a, b = slices.Clone(a), slices.Clone(b)
	slices.Sort(a)
	slices.Sort(b)
	return slices.Equal(slices.Compact(a), slices.Compact(b))
}
