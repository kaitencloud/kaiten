declare global {
  interface Window {
    __KAITEN_DISABLE_CEL_WASM_VALIDATION__?: boolean;
    __KAITEN_STORYBOOK_TEST__?: boolean;
  }
}

if (typeof window !== 'undefined') {
  window.__KAITEN_DISABLE_CEL_WASM_VALIDATION__ = true;
  window.__KAITEN_STORYBOOK_TEST__ = true;
}

export {};
