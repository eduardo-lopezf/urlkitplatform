/** Base URL of the API. Only Redirect Inspector and the metrics beacon use it (FR-006). */
export const API_URL: string =
  (import.meta.env.PUBLIC_API_URL as string | undefined) ?? 'http://localhost:8787';
