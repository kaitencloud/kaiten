package reportentitlementusagemetric

import (
	"encoding/json"
	"strconv"
)

// maxMetadataBytes is the largest report metadata stored on the journal row,
// measured on the encoding encodeMetadata produces. Above it the metadata is
// dropped, not refused: the report still counts, and the response says so
// (Kaiten-Metadata-Dropped: too_large).
const maxMetadataBytes = 4096

// metadataDroppedTooLarge is the Kaiten-Metadata-Dropped value for metadata
// above maxMetadataBytes.
const metadataDroppedTooLarge = "too_large"

// encodeMetadata returns the report's metadata as the JSON stored in
// usage_ledger.properties, or nil when there is none to store. dropped is
// true when there was some but it was too large.
//
// The encoding is Go's compact JSON (sorted keys, HTML-escaped), except that
// numbers are written in plain notation: 1e300 becomes its 301 digits. That
// is how PostgreSQL renders a jsonb number, so the size measured here is the
// size stored, and the 8 KiB CHECK on the column -- a backstop that also
// counts the spaces jsonb::text adds -- cannot refuse what passed this check.
func encodeMetadata(metadata map[string]any) (properties []byte, dropped bool, err error) {
	if len(metadata) == 0 {
		return nil, false, nil
	}
	encoded, err := json.Marshal(plainNumbers(metadata))
	if err != nil {
		return nil, false, err
	}
	if len(encoded) > maxMetadataBytes {
		return nil, true, nil
	}
	return encoded, false, nil
}

// plainNumbers copies v with every float64 replaced by a json.Number in plain
// decimal notation, the shortest that parses back to the same float64.
func plainNumbers(v any) any {
	switch value := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(value))
		for k, item := range value {
			out[k] = plainNumbers(item)
		}
		return out
	case []any:
		out := make([]any, len(value))
		for i, item := range value {
			out[i] = plainNumbers(item)
		}
		return out
	case float64:
		return json.Number(strconv.FormatFloat(value, 'f', -1, 64))
	default:
		return v
	}
}
