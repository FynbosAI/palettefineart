/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_TERMS_BYPASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
