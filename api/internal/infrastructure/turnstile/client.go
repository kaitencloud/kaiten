// Package turnstile verifies Cloudflare Turnstile tokens: the challenge an
// anonymous checkout's start passes before anything is written (V32-01,
// §14.8 rule 1).
package turnstile

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

// VerifyURL is Cloudflare's siteverify endpoint. It is not configurable: an
// address pointed at a fake that always says yes would bypass Turnstile, which
// the spec forbids, self-hosted included (V32-01 rule 6, §16.4). An egress
// proxy goes through HTTPS_PROXY.
const VerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

// Timeout bounds one verification: past it the start answers 503
// .TurnstileUnavailable.
const Timeout = 5 * time.Second

// ErrUnavailable is a verification that got no answer: Cloudflare unreachable,
// too slow, answering 5xx, or reporting its own internal-error, which it asks
// to retry. Nothing was decided.
var ErrUnavailable = errors.New("turnstile: verification unavailable")

// Result is Cloudflare's answer for one token.
type Result struct {
	Success bool
	// Hostname is the host the widget was solved on, which the caller checks
	// against the key's allowed origins.
	Hostname string
}

// Verifier verifies one token with a key's secret.
type Verifier interface {
	Verify(ctx context.Context, secret, token, remoteIP string) (Result, error)
}

// Client calls siteverify.
type Client struct {
	url  string
	http *http.Client
}

// NewClient verifies against verifyURL; empty is VerifyURL. Only tests name
// another, through kaiten.Options.
func NewClient(verifyURL string) *Client {
	if verifyURL == "" {
		verifyURL = VerifyURL
	}
	return &Client{url: verifyURL, http: &http.Client{Timeout: Timeout}}
}

type answer struct {
	Success    bool     `json:"success"`
	Hostname   string   `json:"hostname"`
	ErrorCodes []string `json:"error-codes"`
}

// Verify posts the token, the secret and the visitor's address. A token
// refused for any reason -- invalid, expired, already used -- is a Result
// with Success false; only an unanswered call is an error.
func (c *Client) Verify(ctx context.Context, secret, token, remoteIP string) (Result, error) {
	form := url.Values{"secret": {secret}, "response": {token}}
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}
	ctx, cancel := context.WithTimeout(ctx, Timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, strings.NewReader(form.Encode()))
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.http.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 500 {
		return Result{}, fmt.Errorf("%w: status %d", ErrUnavailable, resp.StatusCode)
	}
	var a answer
	if err := json.NewDecoder(resp.Body).Decode(&a); err != nil {
		return Result{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	if !a.Success && slices.Contains(a.ErrorCodes, "internal-error") {
		// Cloudflare could not decide: not the visitor's token refused (E-11).
		return Result{}, fmt.Errorf("%w: internal-error", ErrUnavailable)
	}
	return Result{Success: a.Success, Hostname: strings.ToLower(a.Hostname)}, nil
}
