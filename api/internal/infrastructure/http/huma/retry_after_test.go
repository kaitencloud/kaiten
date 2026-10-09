package huma

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	humalib "github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humafiber"
	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
)

// Appendix A: Retry-After accompanies every 429 and every refusal only time
// resolves. The use case says how long; both routers must send it, rounded up
// to whole seconds, and send nothing when the error carries no wait.
func TestRetryAfterReachesTheClientOnBothRouters(t *testing.T) {
	SetErrorHandler()

	cases := map[string]struct {
		err  error
		want string
	}{
		"a boundary being closed": {
			err:  kaitenerrors.Conflict("Test.BoundaryPending", "retry in a minute").WithRetryAfter(time.Minute),
			want: "60",
		},
		"a rate limit, rounded up": {
			err:  kaitenerrors.TooManyRequests("Test.RateLimited", "slow down", 1500*time.Millisecond),
			want: "2",
		},
		"a rate limit never says 0": {
			err:  kaitenerrors.TooManyRequests("Test.RateLimited", "slow down", 0),
			want: "1",
		},
		"no wait, no header": {
			err:  kaitenerrors.Conflict("Test.NotActive", "canceled"),
			want: "",
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			huma := fiber.New()
			api := humafiber.New(huma, ConfigureErrors(humalib.DefaultConfig("test", "1.0.0")))
			humalib.Register(api, humalib.Operation{
				OperationID: "refused", Method: http.MethodGet, Path: "/refused",
				Errors: []int{http.StatusConflict, http.StatusTooManyRequests},
			}, func(context.Context, *struct{}) (*struct{}, error) { return nil, tc.err })

			plain := fiber.New()
			plain.Get("/refused", func(c fiber.Ctx) error { return fiberapi.Problem(c, tc.err) })

			for router, app := range map[string]*fiber.App{"huma": huma, "fiber": plain} {
				resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/refused", nil))
				require.NoError(t, err)
				_ = resp.Body.Close()
				require.Equal(t, kaitenerrors.GetHTTPStatus(tc.err), resp.StatusCode, router)
				require.Equal(t, tc.want, resp.Header.Get("Retry-After"), router)
			}
		})
	}
}
