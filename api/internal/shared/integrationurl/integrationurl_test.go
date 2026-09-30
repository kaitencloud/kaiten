package integrationurl

import (
	"errors"
	"testing"
)

func strPtr(s string) *string { return &s }

func TestNormalize(t *testing.T) {
	tests := []struct {
		name    string
		in      *string
		want    *string
		wantErr error
	}{
		{
			name: "nil input returns nil, no error",
			in:   nil,
			want: nil,
		},
		{
			name: "empty string returns nil, no error",
			in:   strPtr(""),
			want: nil,
		},
		{
			name: "whitespace-only string returns nil, no error",
			in:   strPtr("   "),
			want: nil,
		},
		{
			name: "valid https URL is trimmed and preserved",
			in:   strPtr("  https://example.com/record/123  "),
			want: strPtr("https://example.com/record/123"),
		},
		{
			name: "valid http URL is accepted",
			in:   strPtr("http://example.com"),
			want: strPtr("http://example.com"),
		},
		{
			name:    "scheme-relative URL is rejected (no scheme)",
			in:      strPtr("//example.com/path"),
			wantErr: ErrInvalid,
		},
		{
			name:    "relative path is rejected (no scheme, no host)",
			in:      strPtr("/just/a/path"),
			wantErr: ErrInvalid,
		},
		{
			name:    "non-http(s) scheme is rejected",
			in:      strPtr("ftp://example.com/file"),
			wantErr: ErrInvalid,
		},
		{
			name:    "javascript scheme is rejected",
			in:      strPtr("javascript:alert(1)"),
			wantErr: ErrInvalid,
		},
		{
			name:    "http scheme with empty host is rejected",
			in:      strPtr("http:///path"),
			wantErr: ErrInvalid,
		},
		{
			name:    "malformed URL is rejected",
			in:      strPtr("http://[::1"),
			wantErr: ErrInvalid,
		},
		{
			name:    "plain text with no scheme is rejected",
			in:      strPtr("not a url"),
			wantErr: ErrInvalid,
		},
		{
			name: "URL with query string and fragment is preserved",
			in:   strPtr("https://app.example.com/w/acme/record/rec_123?tab=notes#top"),
			want: strPtr("https://app.example.com/w/acme/record/rec_123?tab=notes#top"),
		},
		{
			name: "URL with explicit port is preserved",
			in:   strPtr("https://example.com:8443/path"),
			want: strPtr("https://example.com:8443/path"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Normalize(tt.in)

			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("Normalize(%v) error = %v, want %v", derefOrNil(tt.in), err, tt.wantErr)
				}
				if got != nil {
					t.Errorf("Normalize(%v) = %v, want nil on error", derefOrNil(tt.in), *got)
				}
				return
			}

			if err != nil {
				t.Fatalf("Normalize(%v) unexpected error: %v", derefOrNil(tt.in), err)
			}

			if tt.want == nil {
				if got != nil {
					t.Errorf("Normalize(%v) = %v, want nil", derefOrNil(tt.in), *got)
				}
				return
			}

			if got == nil {
				t.Fatalf("Normalize(%v) = nil, want %v", derefOrNil(tt.in), *tt.want)
			}
			if *got != *tt.want {
				t.Errorf("Normalize(%v) = %v, want %v", derefOrNil(tt.in), *got, *tt.want)
			}
		})
	}
}

func derefOrNil(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}
