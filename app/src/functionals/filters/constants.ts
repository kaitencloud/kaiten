// ASCII Unit Separator (U+001F). Used as the join/split delimiter for
// multi-value filter selections (`enum_list`) serialized into a single
// `FilterModel` string. US is chosen over `,` so an enum value that itself
// contains a comma (e.g. "red, blue") roundtrips correctly; control characters
// in that range never appear in human-typed labels, so it can't collide with
// user content.
//
// Single source of truth shared by the component layer (FilterMultiSelect,
// toolbar label utils) and the logic layer (filter-value-evaluator). Lives in a
// dependency-free leaf module so `logic/` can import it without reaching into
// `components/` — which would create a circular import.
export const FILTER_MULTI_SELECT_SEPARATOR = '\x1F';
