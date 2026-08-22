/// <reference types="vite/client" />

// Vite's `?url` suffix returns the emitted asset path as a string.
declare module '*.css?url' {
  const url: string;
  export default url;
}
