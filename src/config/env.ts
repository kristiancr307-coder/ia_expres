import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number()
    .int()
    .min(1)
    .max(65535)
    .default(3000),

  HOST: z.string()
    .min(1)
    .default('127.0.0.1'),

  AI_EXECUTION_MODE: z.enum([
    'mock',
    'openrouter'
  ]).default('mock'),

  REQUEST_TIMEOUT_MS: z.coerce.number()
    .int()
    .min(1000)
    .max(120000)
    .default(15000),

  OPENROUTER_API_KEY: z.string().optional(),

  OPENROUTER_MODEL: z.string().optional(),

  OPENROUTER_BASE_URL: z.string()
    .min(1)
    .default('https://openrouter.ai/api/v1')
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(
  source: NodeJS.ProcessEnv = process.env
): AppConfig {

  const config = envSchema.parse(source);

  if (config.AI_EXECUTION_MODE === 'openrouter') {

    if (
      !config.OPENROUTER_API_KEY ||
      !config.OPENROUTER_MODEL
    ) {
      throw new Error(
        'Debes configurar OPENROUTER_API_KEY y OPENROUTER_MODEL.'
      );
    }

    // El modelo debe ser gratuito explícito: sufijo ":free".
    // Esto evita que un id facturable llegue a la inferencia.

    if (!config.OPENROUTER_MODEL.endsWith(':free')) {

      throw new Error(
        `OPENROUTER_MODEL="${config.OPENROUTER_MODEL}" no termina en ":free". ` +
          'Ejecuta "npm run models:list" y copia un id gratuito vigente.'
      );
    }
  }

  return config;
}
