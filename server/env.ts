export interface Bindings {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV?: string;
  AUTH_BASE_URL: string;
  AUTH_RP_ID: string;
  BETTER_AUTH_SECRET?: string;
}
