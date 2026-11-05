/**
 * Lista solo modelos GRATUITOS y de TEXTO del catálogo de OpenRouter.
 *
 * Usa exactamente la misma regla que aplica la API antes de cada
 * inferencia (`isVerifiedFreeTextModel`), así lo que ves aquí es
 * lo que la API aceptará.
 *
 * Uso:
 *   npm run models:list
 *
 * No consume tokens: solo hace GET al catálogo de modelos.
 */

import 'dotenv/config';

import { z } from 'zod';

import { isVerifiedFreeTextModel } from '../src/ai/openrouter.js';

const CATALOG_URL =
  process.env.OPENROUTER_MODELS_URL ??
  'https://openrouter.ai/api/v1/models';

const TIMEOUT_MS = (() => {

  const raw = Number(
    process.env.REQUEST_TIMEOUT_MS ?? '15000'
  );

  return Number.isFinite(raw) && raw >= 1000
    ? raw
    : 15000;
})();

const catalogSchema = z.object({
  data: z.array(z.unknown())
});

const idSchema = z.object({
  id: z.string().min(1)
});

async function fetchCatalog(): Promise<unknown[]> {

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  const headers: Record<string, string> = {
    Accept: 'application/json'
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response: Response;

  try {

    response = await fetch(CATALOG_URL, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

  } catch {

    throw new Error(
      `No se pudo conectar con ${CATALOG_URL}. Revisa tu conexión a Internet.`
    );
  }

  if (response.status === 429) {

    throw new Error(
      'OpenRouter respondió 429 (límite de solicitudes). Espera un momento y reintenta.'
    );
  }

  if (!response.ok) {

    throw new Error(
      `OpenRouter respondió ${response.status}. No se pudo leer el catálogo.`
    );
  }

  const parsed = catalogSchema.safeParse(
    await response.json()
  );

  if (!parsed.success) {

    throw new Error(
      'El catálogo de OpenRouter no tiene el formato esperado.'
    );
  }

  return parsed.data.data;
}

async function main(): Promise<void> {

  console.log(`Consultando catálogo: ${CATALOG_URL}`);

  const models = await fetchCatalog();

  const free: string[] = [];

  for (const item of models) {

    const parsedId = idSchema.safeParse(item);

    if (!parsedId.success) {
      continue;
    }

    const id = parsedId.data.id;

    if (isVerifiedFreeTextModel(item, id)) {
      free.push(id);
    }
  }

  free.sort((a, b) => a.localeCompare(b));

  console.log('');
  console.log(`Modelos del catálogo: ${models.length}`);
  console.log(
    `Gratuitos verificados (texto, precio 0): ${free.length}`
  );
  console.log('');

  if (free.length === 0) {

    console.log(
      'No hay modelos gratuitos verificables en este momento.'
    );

    console.log(
      'Usa AI_EXECUTION_MODE=mock mientras tanto.'
    );

    return;
  }

  for (const id of free) {
    console.log(`  ${id}`);
  }

  const current = process.env.OPENROUTER_MODEL?.trim();

  console.log('');
  console.log('Copia uno en tu .env:');
  console.log(`OPENROUTER_MODEL=${free[0]}`);
  console.log('');

  if (!current) {

    console.log(
      'Aviso: OPENROUTER_MODEL está vacío en tu .env.'
    );

  } else if (current.endsWith(':free') && !free.includes(current)) {

    console.log(
      `Aviso: "${current}" no aparece como gratuito verificado. No lo uses.`
    );

  } else if (!current.endsWith(':free')) {

    console.log(
      `Aviso: "${current}" no termina en ":free"; la API lo rechazará con FREE_MODEL_REQUIRED.`
    );
  }
}

main().catch((error: unknown) => {

  console.error('');
  console.error(
    error instanceof Error
      ? error.message
      : String(error)
  );
  console.error('');

  process.exitCode = 1;
});
