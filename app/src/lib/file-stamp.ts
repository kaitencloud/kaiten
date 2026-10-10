const pad = (value: number) => String(value).padStart(2, '0');

/**
 * The UTC moment of a download as a file name carries it, `20271004T153000Z`: the
 * console names the files it saves (the API proposes a name that a browser reads
 * only from the origin of the console), and the moment keeps two exports from
 * overwriting each other.
 */
export function formatFileStamp(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}
