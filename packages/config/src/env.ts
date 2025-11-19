import { z } from 'zod';

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().optional(),
  // Comma-separated list of allowed CORS origins (takes precedence over CORS_ORIGIN if provided)
  CORS_ORIGINS: z.string().optional(),
  // Google OAuth client ID used to verify ID tokens
  GOOGLE_CLIENT_ID: z.string().optional(),
  // Web base URL used to construct links sent in emails (e.g., password reset)
  WEB_BASE_URL: z.string().url().optional(),
  // Email provider configuration (SES via SMTP)
  EMAIL_PROVIDER: z.enum(['ses']).default('ses'),
  SES_SMTP_HOST: z.string().optional(),
  SES_SMTP_PORT: z.coerce.number().optional(),
  SES_SMTP_USER: z.string().optional(),
  SES_SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().optional(),
  ASTERDEX_ENABLED: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        if (value.trim() === '') return undefined;
        return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
      }
      return undefined;
    })
    .default(false),
  ASTERDEX_BASE_URL: z.string().url().optional(),
  ASTERDEX_SPOT_BASE_URL: z.string().url().optional(),
  ASTERDEX_POLL_INTERVAL_MS: z.coerce.number().positive().optional(),
  ASTERDEX_USER_ID: z.string().optional(),
  ASTERDEX_USER_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  ASTERDEX_SIGNER_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  ASTERDEX_SIGNER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
  ASTERDEX_RECV_WINDOW_MS: z
    .coerce.number()
    .positive()
    .max(60_000)
    .optional(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadApiEnv(src: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = apiEnvSchema.safeParse(src);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid API environment configuration:\n${issues}`);
  }
  return parsed.data;
}

const webEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
});
export type WebEnv = z.infer<typeof webEnvSchema>;
export function validateWebEnv(src: NodeJS.ProcessEnv = process.env): WebEnv {
  const parsed = webEnvSchema.safeParse(src);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid Web environment configuration:\n${issues}`);
  }
  return parsed.data;
}

