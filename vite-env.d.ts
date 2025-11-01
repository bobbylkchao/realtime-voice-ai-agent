/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_CHAT_SERVER_URL: string
  readonly VITE_APP_API_CHAT_SERVER_REALTIME_PATH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
