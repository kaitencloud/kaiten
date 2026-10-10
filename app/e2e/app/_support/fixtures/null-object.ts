/**
 * The null of a member that the contract spells as an object or null (a hold, a
 * provider record, a scheduled change, a metered price's meter). The generated types
 * give such a member as `T | never`, which is `T`, and cannot hold the null the API
 * sends; a fixture that stands for the API writes the null through here, and the
 * contract check of the mocks (`parseContract`) still sees the null.
 */
export const NULL_OBJECT: never = null as never;
