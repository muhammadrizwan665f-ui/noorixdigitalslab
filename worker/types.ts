export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  SITE_URL: string;
  SITE_NAME: string;
  WHATSAPP: string;
  ENCRYPTION_KEY?: string;
  SETUP_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  PAYFAST_MERCHANT_ID?: string;
  PAYFAST_SECURED_KEY?: string;
  [k: string]: unknown;
}
export interface AuthUser {
  id: string; email: string; name: string; phone: string | null;
  status: string; is_staff: number; email_verified_at: string | null;
}
export type Vars = {
  user: AuthUser | null;
  perms: Set<string>;
  isSuper: boolean;
  sessionId: string | null;
  csrf: string | null;
  ip: string;
};
export type HonoEnv = { Bindings: Env; Variables: Vars };
