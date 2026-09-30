import { CircleDashed, type LucideProps } from 'lucide-react';
import { DynamicIcon, iconNames } from 'lucide-react/dynamic';
import type * as React from 'react';

/**
 * Icon abstraction boundary.
 *
 * This is the ONLY module in the codebase allowed to import from `lucide-react`.
 * Everything else renders icons through {@link EntityIcon} and the provider
 * registry below, so swapping or adding an icon library (heroicons, custom SVGs,
 * emoji…) never touches call sites — you add one resolver here.
 *
 * Icons are referenced by a provider-namespaced token: `"provider:name"`, e.g.
 * `"lucide:rocket"`. The token is what gets persisted, keeping storage decoupled
 * from any single library.
 */

export const ICON_TOKEN_SEPARATOR = ':';

/** A provider-namespaced icon token, e.g. `"lucide:rocket"`. */
export type IconToken = string;

/** Identifiers of the icon providers known to the registry. */
export type IconProviderId = 'lucide';

type ParsedIconToken = {
  provider: string;
  name: string;
};

type IconResolver = (name: string, props: LucideProps) => React.ReactNode;

/**
 * Lucide's `DynamicIcon` types `name` as a ~1900-member string-literal union that
 * is fragile to resolve across lucide versions. Names are validated at runtime via
 * {@link isLucideIconName}, so the component is exposed here as accepting a plain
 * string — this keeps the boundary resilient to lucide version drift.
 */
const LucideDynamicIcon = DynamicIcon as unknown as React.ComponentType<
  LucideProps & { name: string }
>;

const lucideIconNames = new Set<string>(iconNames as readonly string[]);

/** Is `name` a valid Lucide icon name? */
export function isLucideIconName(name: string): boolean {
  return lucideIconNames.has(name);
}

/** The full list of selectable Lucide icon names (for pickers). */
export const lucideIconNameList: readonly string[] =
  iconNames as readonly string[];

/** Fallback rendered when a token is malformed or its icon cannot be resolved. */
export function FallbackIcon(props: LucideProps) {
  return <CircleDashed {...props} />;
}

const ICON_PROVIDERS: Record<IconProviderId, IconResolver> = {
  lucide: (name, props) =>
    isLucideIconName(name) ? (
      <LucideDynamicIcon name={name} {...props} />
    ) : (
      <FallbackIcon {...props} />
    ),
};

/** Parse a `"provider:name"` token. Returns `null` when unset or malformed. */
export function parseIconToken(token?: string | null): ParsedIconToken | null {
  if (!token) {
    return null;
  }
  const separatorIndex = token.indexOf(ICON_TOKEN_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return null;
  }
  return {
    provider: token.slice(0, separatorIndex),
    name: token.slice(separatorIndex + 1),
  };
}

/** Build a token from a provider and an icon name. */
export function formatIconToken(
  provider: IconProviderId,
  name: string,
): IconToken {
  return `${provider}${ICON_TOKEN_SEPARATOR}${name}`;
}

export type EntityIconProps = LucideProps & {
  /** Provider-namespaced token, e.g. `"lucide:rocket"`. */
  token?: string | null;
  /** Rendered when no token is set. Defaults to nothing. */
  emptyFallback?: React.ReactNode;
};

/**
 * Render an icon from a provider-namespaced token. Unknown providers or invalid
 * names degrade to {@link FallbackIcon}; an empty token renders `emptyFallback`.
 */
export function EntityIcon({
  token,
  emptyFallback = null,
  ...props
}: EntityIconProps) {
  const parsed = parseIconToken(token);
  if (!parsed) {
    return emptyFallback;
  }

  const resolve = ICON_PROVIDERS[parsed.provider as IconProviderId];
  if (!resolve) {
    return <FallbackIcon {...props} />;
  }

  return resolve(parsed.name, props);
}
