package stripefake_test

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
)

func post(t *testing.T, f *stripefake.Fake, path, key string, form url.Values) (*http.Response, string, error) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, f.URL()+path, strings.NewReader(form.Encode()))
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer rk_test_A1")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	resp, err := f.Client().Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp, string(body), nil
}

func TestIdempotency(t *testing.T) {
	f := stripefake.New(t)
	form := url.Values{"name": {"Acme"}}

	first, body, err := post(t, f, "/v1/customers", "k1", form)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, first.StatusCode)

	replay, again, err := post(t, f, "/v1/customers", "k1", form)
	require.NoError(t, err)
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))
	require.Equal(t, body, again)
	require.Equal(t, 1, f.Customers(stripefake.DefaultAccount))

	mismatch, errBody, err := post(t, f, "/v1/customers", "k1", url.Values{"name": {"Other"}})
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, mismatch.StatusCode)
	require.Contains(t, errBody, "idempotency_error")

	f.Advance(25 * time.Hour)
	expired, _, err := post(t, f, "/v1/customers", "k1", form)
	require.NoError(t, err)
	require.Empty(t, expired.Header.Get("Idempotent-Replayed"), "a key is remembered 24 hours")
	require.Equal(t, 2, f.Customers(stripefake.DefaultAccount))
}

func TestStoredErrorsReplayAndInjectedValidationDoesNot(t *testing.T) {
	f := stripefake.New(t)
	f.Fail(stripefake.OpCreateCustomer, http.StatusInternalServerError, "api_error", "", 1)
	resp, _, err := post(t, f, "/v1/customers", "k5", url.Values{"name": {"Acme"}})
	require.NoError(t, err)
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	replay, _, err := post(t, f, "/v1/customers", "k5", url.Values{"name": {"Acme"}})
	require.NoError(t, err)
	require.Equal(t, http.StatusInternalServerError, replay.StatusCode, "an executed 5xx is stored under its key")
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))

	f.Fail(stripefake.OpCreateCustomer, http.StatusTooManyRequests, "invalid_request_error", "rate_limit", 1)
	limited, _, err := post(t, f, "/v1/customers", "k6", url.Values{"name": {"Acme"}})
	require.NoError(t, err)
	require.Equal(t, http.StatusTooManyRequests, limited.StatusCode)
	ok, _, err := post(t, f, "/v1/customers", "k6", url.Values{"name": {"Acme"}})
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, ok.StatusCode, "a 429 is not stored")
}

func TestDropResponseAppliesTheEffect(t *testing.T) {
	f := stripefake.New(t)
	f.DropResponse(stripefake.OpCreateCustomer)
	_, _, err := post(t, f, "/v1/customers", "k2", url.Values{"name": {"Acme"}})
	require.Error(t, err, "the connection closes before the answer")
	require.Equal(t, 1, f.Customers(stripefake.DefaultAccount))

	replay, _, err := post(t, f, "/v1/customers", "k2", url.Values{"name": {"Acme"}})
	require.NoError(t, err)
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"), "the retry under the same key is replayed")
	require.Equal(t, 1, f.Customers(stripefake.DefaultAccount))
}

func TestAccountsAreIsolated(t *testing.T) {
	f := stripefake.New(t)
	_, body, err := post(t, f, "/v1/customers", "", url.Values{"name": {"Acme"}})
	require.NoError(t, err)
	require.Contains(t, body, `"id":"cus_1"`)

	f.SetAccount("rk_test_Other", "acct_other")
	req, _ := http.NewRequest(http.MethodGet, f.URL()+"/v1/customers/cus_1", nil)
	req.Header.Set("Authorization", "Bearer rk_test_Other")
	resp, err := f.Client().Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusNotFound, resp.StatusCode)
}
