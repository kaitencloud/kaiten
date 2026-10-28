package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// These tests run only a stub issuer in a temporary directory. They never call
// admin-tools, a database, a provider or a runtime, nor generate credentials.
func runLocalCredentialScript(t *testing.T, action string, existing *string) (string, string, error) {
	t.Helper()
	dir := t.TempDir()
	trace := filepath.Join(dir, "calls")
	file := filepath.Join(dir, "platform-flags-token")
	if existing != nil {
		if err := os.WriteFile(file, []byte(*existing), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	mock := "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$MOCK_TRACE\"\n"
	if err := os.WriteFile(filepath.Join(dir, "kaiten-admin-tools"), []byte(mock), 0o700); err != nil {
		t.Fatal(err)
	}
	script, err := filepath.Abs("../../../scripts/local-credentials.sh")
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.CommandContext(t.Context(), "sh", script, action)
	cmd.Env = []string{
		"PATH=" + dir + ":/bin:/usr/bin", "HOME=" + dir, "MOCK_TRACE=" + trace,
		"KAITEN_PLATFORM_TOKEN_FILE=" + filepath.Join(dir, "platform-token"),
		"KAITEN_PLATFORM_FLAGS_TOKEN_FILE=" + file,
		"PLATFORM_FLAGS_ORGANIZATION_EXTERNAL_ID=org_dogfooding",
		// Broad ordinary platform scopes must never leak to the flags token.
		"PLATFORM_SCOPES=write:tokens,delete:organizations",
	}
	out, runErr := cmd.CombinedOutput()
	calls, err := os.ReadFile(trace)
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if existing != nil {
		contents, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if string(contents) != *existing {
			t.Fatal("existing credential file was changed")
		}
	}
	return string(calls), string(out), runErr
}

func TestFlagsEnsurePreservesExistingFileWithoutIssuerCall(t *testing.T) {
	contents := "synthetic-existing-file"
	calls, out, err := runLocalCredentialScript(t, "flags-ensure", &contents)
	if err != nil {
		t.Fatalf("script failed: %v: %s", err, out)
	}
	if calls != "" {
		t.Fatalf("existing file invoked issuer: %s", calls)
	}
	if strings.Contains(out, contents) {
		t.Fatal("file contents reached output")
	}
}

func TestFlagsEnsureRefusesEmptyFileWithoutIssuance(t *testing.T) {
	contents := ""
	calls, _, err := runLocalCredentialScript(t, "flags-ensure", &contents)
	if err == nil {
		t.Fatal("empty existing file must require explicit recovery")
	}
	if calls != "" {
		t.Fatal("empty file must not be replaced implicitly")
	}
}

func TestExplicitFlagsActionsUseOnlyReadScopeAndTrustedSource(t *testing.T) {
	for _, action := range []string{"flags-ensure", "flags-rotate"} {
		t.Run(action, func(t *testing.T) {
			calls, out, err := runLocalCredentialScript(t, action, nil)
			if err != nil {
				t.Fatalf("script failed: %v: %s", err, out)
			}
			if !strings.HasPrefix(calls, "service-token\nmint\n--org\norg_dogfooding\n") {
				t.Fatalf("unexpected issuer arguments: %s", calls)
			}
			if !strings.Contains(calls, "--scopes\nread:feature_flags\n") || strings.Contains(calls, "write:") || strings.Contains(calls, "delete:") {
				t.Fatalf("flags scope widened: %s", calls)
			}
			if strings.Contains(calls, "--replace\n") != (action == "flags-rotate") {
				t.Fatalf("replacement is not explicit: %s", calls)
			}
			if !strings.Contains(calls, "--output-file\n") {
				t.Fatal("credential destination must not be stdout")
			}
		})
	}
}

func TestOrdinaryBootstrapNeverIssuesFlagsCredential(t *testing.T) {
	calls, out, err := runLocalCredentialScript(t, "ensure", nil)
	if err != nil {
		t.Fatalf("script failed: %v: %s", err, out)
	}
	if !strings.HasPrefix(calls, "platform-token\nensure-local\n") || strings.Contains(calls, "service-token") || strings.Contains(calls, "read:feature_flags") {
		t.Fatalf("startup issued flags credential: %s", calls)
	}
}
