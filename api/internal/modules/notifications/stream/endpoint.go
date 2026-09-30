// Package stream is the SSE transport for the notification feed.
//
// Not a huma operation: huma describes request/response pairs with a body it
// serializes once, and this is an open connection writing frames for as long as
// the tab is open. It is registered straight on the Fiber router, the way the
// OFREP endpoints are.
//
// The contract, which the client already implements: the stream is a HINT, never
// the source of truth. Every `connected` frame makes the client refetch the feed,
// so a dropped frame, a missed announcement or a replica restart costs a stale
// badge until the next event -- never a wrong one. That is what lets this have no
// replay buffer, no resume ids and no per-connection durability.
package stream

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/valyala/fasthttp"

	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/hub"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
)

const (
	// heartbeatInterval keeps the connection alive through everything between
	// the browser and this process. Envoy's stream_idle_timeout defaults to 5
	// minutes and proxies in general treat a silent connection as dead, so the
	// comment frame is not decoration -- it is what makes the stream long-lived.
	//
	// It is also what pushes the socket write deadline forward: see writeFrame.
	heartbeatInterval = 20 * time.Second

	// maxLifetime ends a stream that has done nothing wrong.
	//
	// Without it, connections accumulate on whichever replica has been up
	// longest, and a rollout is the only thing that ever rebalances them. The
	// client reconnects immediately, so the cost is one request every quarter of
	// an hour per tab, and the benefit is that "restart the pods" stops being
	// the only way to redistribute load.
	maxLifetime = 15 * time.Minute

	// frameBuffer is how many frames may queue for a client that is not reading.
	// Past it frames are dropped rather than blocking the fan-out -- see
	// hub.Connection.Send.
	frameBuffer = 16

	// writeDeadlineHeadroom is added to the heartbeat interval when pushing the
	// socket's write deadline forward. Fiber sets a WriteTimeout for the whole
	// response (2 x the GraphQL operation budget), which a streaming response
	// would otherwise hit mid-stream; each write extends its own deadline past
	// the next heartbeat, so the only thing that can still trip it is a client
	// that has stopped reading -- which is exactly what it should catch.
	writeDeadlineHeadroom = 10 * time.Second
)

// Opener is the facade: it checks the scope and resolves what the first frame
// carries, then hands over the registry this transport registers against.
type Opener interface {
	OpenStream(ctx context.Context, cl caller.OrganizationCaller) (Session, error)
	Streams() *hub.Hub
}

// RegisterEndpoint mounts GET /v1/notifications/stream.
//
// AUTHENTICATION IS AT THE EDGE, and that is a deployment fact this handler
// depends on: EventSource cannot send an Authorization header, so the gateway
// route for this path extracts the Clerk JWT from the session cookie instead
// (chart: kaiten-api-notifications-stream). By the time a request arrives here it
// has been through the same JWT validation and the same claim-to-header mapping
// as every other call, so the caller resolves exactly as it does elsewhere --
// there is no second authentication path in this codebase to keep in step.
func RegisterEndpoint(router fiber.Router, app Opener) {
	router.Get("/v1/notifications/stream", func(c fiber.Ctx) error {
		cl, err := caller.Organization(c.Context())
		if err != nil {
			return fiberapi.Problem(c, err)
		}

		// Authorized and resolved before the stream opens: a user subscribed to
		// nothing still gets a connection (their preferences can change while it
		// is open), but the first frame should already be correct.
		session, err := app.OpenStream(c.Context(), cl)
		if err != nil {
			return fiberapi.Problem(c, err)
		}

		streams := app.Streams()

		connection, err := streams.Add(cl.UserID(), cl.OrganizationID(), frameBuffer)
		if err != nil {
			var atCapacity hub.ErrAtCapacity
			if errors.As(err, &atCapacity) {
				// 503 rather than 429: the client is not at fault and its own
				// backoff already knows what to do with this.
				return c.Status(fiber.StatusServiceUnavailable).
					JSON(fiber.Map{"detail": "no stream capacity on this replica"})
			}

			return fiberapi.Problem(c, err)
		}
		connection.SetSubscription(session.Subscription)

		c.Set(fiber.HeaderContentType, "text/event-stream")
		c.Set(fiber.HeaderCacheControl, "no-store")
		c.Set(fiber.HeaderConnection, "keep-alive")
		// Nginx (the app container in front of some deployments) buffers proxied
		// responses by default, which turns a stream into one long-delayed blob.
		c.Set("X-Accel-Buffering", "no")

		userID := cl.UserID()

		// Everything the stream writer needs, read before it starts. The writer
		// runs after this handler returns, and Fiber recycles the context at
		// that point unless it is abandoned -- which is what Abandon below
		// stops. Reading through `c` from inside the writer would then be
		// reading a context serving somebody else's request.
		requestCtx := c.RequestCtx()

		// Detached from the request context on purpose. Fiber considers the
		// request finished the moment this handler returns -- which is BEFORE
		// the stream writer runs -- so a writer that watched c.Context().Done()
		// would exit immediately, send its `connected` frame and nothing else,
		// and take the connection out of the hub while the client still had a
		// socket open. Found exactly that way: `connected` arrived, the next
		// announcement reported zero connections.
		//
		// What ends a stream instead: the client going away (the next write
		// fails), the hub evicting it, or the maximum lifetime below.
		streamCtx := context.WithoutCancel(c.Context())

		// Without this the context is released back to the pool while the
		// writer is still using it, and the response never reaches the client:
		// the request simply hangs until the client gives up. Fiber's own SSE
		// middleware does the same thing for the same reason.
		c.Abandon()

		return c.SendStreamWriter(func(w *bufio.Writer) {
			defer streams.Remove(connection)

			// The client's own reconnect delay, so a server restart does not
			// produce a tight reconnect loop from every tab at once.
			if !writeRaw(streamCtx, requestCtx, w, "retry: 5000\n\n") {
				return
			}

			if !writeFrame(streamCtx, requestCtx, w, hub.Frame{
				Name: hub.FrameConnected,
				Data: map[string]any{"unreadCount": session.UnreadCount},
			}) {
				return
			}

			heartbeat := time.NewTicker(heartbeatInterval)
			defer heartbeat.Stop()

			lifetime := time.NewTimer(maxLifetime)
			defer lifetime.Stop()

			for {
				select {
				case frame := <-connection.Frames():
					if !writeFrame(streamCtx, requestCtx, w, frame) {
						return
					}
				case <-heartbeat.C:
					if !writeRaw(streamCtx, requestCtx, w, ": heartbeat\n\n") {
						return
					}
				case <-lifetime.C:
					slog.DebugContext(streamCtx, "notifications: stream reached its maximum lifetime",
						"user_id", userID)

					return
				case <-connection.Closed():
					return
				}
			}
		})
	})
}

func writeFrame(ctx context.Context, requestCtx *fasthttp.RequestCtx, w *bufio.Writer, frame hub.Frame) bool {
	encoded, err := json.Marshal(frame.Data)
	if err != nil {
		slog.ErrorContext(ctx, "notifications: unencodable stream frame",
			"frame", frame.Name, "error", err)

		return true
	}

	return writeRaw(ctx, requestCtx, w, fmt.Sprintf("event: %s\ndata: %s\n\n", frame.Name, encoded))
}

// writeRaw writes one frame and reports whether the stream is still alive.
//
// The write deadline is pushed forward before every write because fasthttp
// applies the server's WriteTimeout to the whole response, and this response
// does not end. Extending it here -- rather than turning the timeout off for the
// listener -- keeps the protection it exists for: a client that stops reading
// still fails, at the next frame, instead of holding a connection forever.
func writeRaw(ctx context.Context, requestCtx *fasthttp.RequestCtx, w *bufio.Writer, payload string) bool {
	if requestCtx != nil && requestCtx.Conn() != nil {
		_ = requestCtx.Conn().SetWriteDeadline(time.Now().Add(heartbeatInterval + writeDeadlineHeadroom))
	}

	if _, err := w.WriteString(payload); err != nil {
		return false
	}

	if err := w.Flush(); err != nil {
		// A client that navigated away is the ordinary case here, not an
		// incident: it is logged at debug and the stream simply ends.
		slog.DebugContext(ctx, "notifications: stream closed by client", "error", err)

		return false
	}

	return true
}
