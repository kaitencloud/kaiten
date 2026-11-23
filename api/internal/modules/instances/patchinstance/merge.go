package patchinstance

import "maps"

// mergeMetadata applies a first-level merge patch to stored metadata and
// returns a new map: each key of patch is set, a key whose value is nil (JSON
// null) is removed, and keys absent from patch are kept. A value replaces the
// stored one whole, lists and objects included. stored is not modified.
func mergeMetadata(stored, patch map[string]any) map[string]any {
	merged := maps.Clone(stored)
	if merged == nil {
		merged = make(map[string]any, len(patch))
	}
	for key, value := range patch {
		if value == nil {
			delete(merged, key)
			continue
		}
		merged[key] = value
	}
	return merged
}
