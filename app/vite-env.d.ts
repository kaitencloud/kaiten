/// <reference types="vite/client" />

declare module 'virtual:dev-tokens' {
  import type { DevToken } from '@/lib/local-auth';
  const tokens: DevToken[];
  export default tokens;
}

declare module 'virtual:tailwind-theme-css' {
  /** Raw contents of the installed tailwindcss package's theme.css. */
  const css: string;
  export default css;
}

// TypeScript's bundler-mode resolver strips the trailing `.api` off
// 'editor.api' as if it were a known extension (looking for
// `editor.d.api.ts` instead of `editor.api.d.ts`), so it can't find these
// subpath declarations even though Vite/Rolldown resolves the real files
// fine via monaco-editor's `"./*"` export map. See code-editor.tsx for why
// we import these subpaths instead of the full 'monaco-editor' barrel.
declare module 'monaco-editor/esm/vs/editor/editor.api' {
  export * from 'monaco-editor';
}

declare module 'monaco-editor/esm/vs/language/json/monaco.contribution' {
  export const jsonDefaults: unknown;
  export function getWorker(): Promise<unknown>;
}

declare module 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
declare module 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
declare module 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
