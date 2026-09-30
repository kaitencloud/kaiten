package kaiten

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/cdc"
)

// The one property that matters about the dead-letter handler, and the one a reader
// is most likely to "fix" the wrong way: it acknowledges everything.
//
// Answering Retry here would republish the message to the dead-letter topic it just
// arrived from. Nothing bounds that topic -- the retry policy applies to the main
// subscription, and the dead-letter subscription deliberately has no dead letter of
// its own -- so one permanently unparseable payload would loop for as long as the
// process lives. Success is what makes the warning the end of the line.
func TestHandleDeadLetterAlwaysAcknowledges(t *testing.T) {
	// A zero Events on purpose: this handler reaches neither the dispatcher nor the
	// organization use cases, and a test that had to build them would be asserting
	// that it does.
	var events Events

	for name, payload := range map[string][]byte{
		"a well-formed envelope": []byte(`{"id":"e1","organization_id":"17dfc5dd-7007-5242-96ca-bf74f5f3c4b4",` +
			`"event_name":"CUSTOMER_CREATED","event_type":"com.kaiten.customer.v1.created","data":{}}`),
		"an envelope that will not parse": []byte(`{"id":`),
		"empty":                           {},
		// Shorter than the prefix the log line truncates to, which is the one input
		// that would panic a slice written as payload[:256].
		"one byte": []byte(`x`),
	} {
		t.Run(name, func(t *testing.T) {
			assert.Equal(t, cdc.Success, events.HandleDeadLetter(context.Background(), payload),
				"a dead-lettered delivery is acknowledged, or it comes back forever")
		})
	}
}
