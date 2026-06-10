/// <reference types="vite/client" />

import type { GraiderUIApi } from "../electron/ipc";

declare global {
  interface Window {
    readonly graiderUI: GraiderUIApi;
  }
}

export {};
