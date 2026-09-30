package attioclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// jsonClient is the minimal authenticated JSON REST client this package needs.
type jsonClient struct {
	baseURL string
	token   string
	http    *http.Client
}

// newJSONClient builds a client authenticated with a bearer token against baseURL.
//
// The transport is instrumented, so a call to Attio appears inside the CDC consumer's
// span rather than as an unexplained gap in it -- this is the only synchronous call to
// another service on the consumer path, so it is exactly the span worth having.
func newJSONClient(baseURL, token string, timeout time.Duration) *jsonClient {
	return &jsonClient{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		token:   token,
		http: &http.Client{
			Timeout:   timeout,
			Transport: otelhttp.NewTransport(http.DefaultTransport),
		},
	}
}

// Do sends a JSON request (or none, if payload is nil) to path and returns the raw
// response status and body.
func (c *jsonClient) Do(ctx context.Context, method, path string, payload any) (int, []byte, error) {
	var bodyReader io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return 0, nil, fmt.Errorf("marshal request payload: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return 0, nil, fmt.Errorf("build request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, nil, fmt.Errorf("read response body: %w", err)
	}

	return resp.StatusCode, body, nil
}
