import { z } from 'zod';

import type { AppConfig } from '../config/env.ts';

import type { AskResult } from '../contracts/ask.js';

import { ApiError } from '../errors/api-error.js';

// 1. Contrato de un modelo del catálogo
// Las tarifas pueden venir como texto o como número, y
// "request" puede faltar (se interpreta como 0).

const priceSchema = z.union([
  z.string(),
  z.number()
]).transform((value) => String(value));

const modelSchema = z.object({
  id: z.string(),

  pricing: z.object({
    prompt: priceSchema,
    completion: priceSchema,
    request: priceSchema.optional().default('0')
  }),

  architecture: z.object({
    input_modalities: z.array(z.string()),
    output_modalities: z.array(z.string())
  })
});

// 2. Contrato del catálogo

const catalogSchema = z.object({
  data: z.array(z.unknown())
});

// 3. Contrato de una respuesta del LLM

const completionSchema = z.object({
  model: z.string().optional(),

  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullish()
      })
    })
  ).min(1),

  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number()
  }).optional()
});

// 4. Base del proveedor sin barra final

function baseUrl(config: AppConfig): string {

  return config.OPENROUTER_BASE_URL.replace(/\/+$/, '');
}

// 5. Comprobar si una tarifa es cero

function isZeroPrice(value: string): boolean {

  return (
    value.trim() !== '' &&
    Number.isFinite(Number(value)) &&
    Number(value) === 0
  );
}

// 6. Motivo por el que un modelo no califica

export type FreeModelRejection =
  | 'INVALID_SHAPE'
  | 'ID_MISMATCH'
  | 'NOT_FREE_SUFFIX'
  | 'NONZERO_PRICE'
  | 'NOT_TEXT';

export type FreeModelCheck =
  | { ok: true }
  | { ok: false; reason: FreeModelRejection };

// 7. Verificar un modelo del catálogo (misma regla para la API y el script)

export function inspectFreeModel(
  raw: unknown,
  selectedId: string
): FreeModelCheck {

  const parsed = modelSchema.safeParse(raw);

  if (!parsed.success) {
    return { ok: false, reason: 'INVALID_SHAPE' };
  }

  const model = parsed.data;

  if (model.id !== selectedId) {
    return { ok: false, reason: 'ID_MISMATCH' };
  }

  if (!selectedId.endsWith(':free')) {
    return { ok: false, reason: 'NOT_FREE_SUFFIX' };
  }

  const prices = [
    model.pricing.prompt,
    model.pricing.completion,
    model.pricing.request
  ];

  if (!prices.every(isZeroPrice)) {
    return { ok: false, reason: 'NONZERO_PRICE' };
  }

  const acceptsText =
    model.architecture.input_modalities.includes('text') &&
    model.architecture.output_modalities.includes('text');

  if (!acceptsText) {
    return { ok: false, reason: 'NOT_TEXT' };
  }

  return { ok: true };
}

// 8. Comprobar modelo gratuito de texto

export function isVerifiedFreeTextModel(
  raw: unknown,
  selectedId: string
): boolean {

  return inspectFreeModel(raw, selectedId).ok;
}

// 9. Función HTTP reutilizable

async function requestJson(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<unknown> {

  let response: Response;

  try {

    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs)
    });

  } catch {

    throw new ApiError(
      503,
      'UPSTREAM_NETWORK_ERROR',
      'No fue posible conectar con OpenRouter.'
    );
  }

  if (response.status === 429) {

    throw new ApiError(
      503,
      'UPSTREAM_RATE_LIMIT',
      'OpenRouter ha alcanzado el límite de solicitudes.'
    );
  }

  if (
    response.status === 401 ||
    response.status === 403
  ) {

    throw new ApiError(
      503,
      'UPSTREAM_AUTH_ERROR',
      'OpenRouter rechazó las credenciales.'
    );
  }

  if (!response.ok) {

    throw new ApiError(
      503,
      'UPSTREAM_ERROR',
      'OpenRouter no pudo procesar la solicitud.'
    );
  }

  try {

    return await response.json() as unknown;

  } catch {

    throw new ApiError(
      503,
      'UPSTREAM_INVALID_JSON',
      'OpenRouter devolvió un JSON inválido.'
    );
  }
}

// 10. Verificar el modelo antes de generar

export async function verifyFreeModel(
  config: AppConfig
): Promise<string> {

  const modelId = config.OPENROUTER_MODEL;
  const apiKey = config.OPENROUTER_API_KEY;

  if (
    !apiKey ||
    !modelId ||
    !modelId.endsWith(':free')
  ) {

    throw new ApiError(
      503,
      'FREE_MODEL_REQUIRED',
      'Debes seleccionar un modelo gratuito explícito terminado en ":free". Consulta: npm run models:list'
    );
  }

  const rawCatalog = await requestJson(
    `${baseUrl(config)}/models`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    },
    config.REQUEST_TIMEOUT_MS
  );

  const parsedCatalog = catalogSchema.safeParse(
    rawCatalog
  );

  if (!parsedCatalog.success) {

    throw new ApiError(
      503,
      'INVALID_MODEL_CATALOG',
      'No se pudo validar el catálogo de modelos.'
    );
  }

  const selectedModel = parsedCatalog.data.data.find(
    (item) => {

      const parsed = z.object({
        id: z.string()
      }).safeParse(item);

      return (
        parsed.success &&
        parsed.data.id === modelId
      );
    }
  );

  if (
    !isVerifiedFreeTextModel(
      selectedModel,
      modelId
    )
  ) {

    throw new ApiError(
      503,
      'FREE_MODEL_UNAVAILABLE',
      'No se confirmó un modelo gratuito compatible con texto. Consulta: npm run models:list'
    );
  }

  return modelId;
}

// 11. Realizar la inferencia

export async function generateOpenRouterAnswer(
  question: string,
  config: AppConfig
): Promise<AskResult> {

  // Primero verificamos el modelo

  const model = await verifyFreeModel(config);

  const apiKey = config.OPENROUTER_API_KEY!;

  // Construimos la solicitud HTTP

  const rawResponse = await requestJson(
    `${baseUrl(config)}/chat/completions`,
    {
      method: 'POST',

      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        model: model,

        messages: [
          {
            role: 'system',
            content:
              'Eres un asistente educativo. Responde en español de forma clara y breve.'
          },
          {
            role: 'user',
            content: question
          }
        ],

        max_tokens: 200,
        stream: false
      })
    },
    config.REQUEST_TIMEOUT_MS
  );

  // Validamos la respuesta

  const parsed = completionSchema.safeParse(
    rawResponse
  );

  if (!parsed.success) {

    throw new ApiError(
      503,
      'INVALID_MODEL_RESPONSE',
      'La respuesta de OpenRouter tiene un formato inválido.'
    );
  }

  const answer =
    parsed.data.choices[0]?.message.content?.trim();

  if (!answer) {

    throw new ApiError(
      503,
      'EMPTY_MODEL_RESPONSE',
      'El modelo no generó contenido de texto.'
    );
  }

  // Construimos la respuesta para nuestra API

  return {
    answer,
    mode: 'openrouter',
    model: parsed.data.model ?? model,

    usage: parsed.data.usage
      ? {
          promptTokens:
            parsed.data.usage.prompt_tokens,

          completionTokens:
            parsed.data.usage.completion_tokens
        }
      : null
  };
}