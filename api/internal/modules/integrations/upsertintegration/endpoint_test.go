package upsertintegration

import (
	"encoding/json"
	"testing"
)

func TestUpsertBodiesUseCamelCaseIntegrationFields(t *testing.T) {
	webURL := "https://app.attio.com/w/acme/record/rec_123"

	customerJSON, err := json.Marshal(CustomerBody{
		IntegrationMetadata: map[string]any{"source": "attio"},
		WebURL:              &webURL,
	})
	if err != nil {
		t.Fatalf("marshal customer body: %v", err)
	}
	assertJSONFields(t, customerJSON, []string{"integrationMetadata", "webUrl"}, []string{"metadata", "web_url"})

	instanceJSON, err := json.Marshal(InstanceBody{
		IntegrationMetadata: map[string]any{"source": "attio"},
		Metadata:            map[string]any{"owner": "platform"},
		WebURL:              &webURL,
	})
	if err != nil {
		t.Fatalf("marshal instance body: %v", err)
	}
	assertJSONFields(t, instanceJSON, []string{"integrationMetadata", "metadata", "webUrl"}, []string{"web_url"})
}

func assertJSONFields(t *testing.T, raw []byte, present, absent []string) {
	t.Helper()

	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatalf("unmarshal body: %v", err)
	}
	for _, field := range present {
		if _, ok := value[field]; !ok {
			t.Errorf("expected field %q in %s", field, raw)
		}
	}
	for _, field := range absent {
		if _, ok := value[field]; ok {
			t.Errorf("did not expect field %q in %s", field, raw)
		}
	}
}
