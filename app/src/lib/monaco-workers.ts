/**
 * Monaco Editor Worker Configuration
 * Configures which workers Monaco should use.
 *
 * The base editor worker covers the custom CEL language and basic editing for
 * every language. The dedicated JSON worker is loaded only for `json` models —
 * it powers schema-aware validation + IntelliSense (used by the metadata-field
 * raw-schema editor). Both worker URLs are lazy: a worker is only instantiated
 * when an editor of the matching language mounts, so the JSON worker stays out
 * of the bundle until a JSON editor is actually opened.
 */

import type * as monacoType from 'monaco-editor';

declare global {
  interface Window {
    MonacoEnvironment: monacoType.Environment | undefined;
  }
}

// Only initialize if window is available (not in SSR or certain test environments)
if (typeof window !== 'undefined') {
  window.MonacoEnvironment = {
    getWorker(_: string, label: string) {
      if (label === 'json') {
        return new Worker(
          new URL(
            'monaco-editor/esm/vs/language/json/json.worker.js',
            import.meta.url,
          ),
          { type: 'module' },
        );
      }

      return new Worker(
        new URL(
          'monaco-editor/esm/vs/editor/editor.worker.js',
          import.meta.url,
        ),
        { type: 'module' },
      );
    },
  };
}
