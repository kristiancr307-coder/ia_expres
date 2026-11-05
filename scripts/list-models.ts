/**
 * Lista solo modelos GRATUITOS y de TEXTO del catálogo de OpenRouter.
 *
 * Usa exactamente la misma regla que aplica la API antes de cada
 * inferencia (`inspectFreeModel`), así lo que ves aquí es lo que la
 * API aceptará.
 *
 * Uso:
 *   npm run models:list          # lista los modelos válidos
 *   npm run models:list -- --debug   # además muestra ejemplos crudos
 *
 * No consume tokens: solo hace un GET al catálogo de modelos.
 */

import 'dotenv/config';

import { z } from 'zod';

import {
  inspectFreeModel,
  type FreeModelRejection
} from '../src/ai/openrouter.js';

const CATALOG_URL =
  process.env.OPENROUTER_MODELS_URL ??
  'https://openrouter.ai/api/v1/models';

const DEBUG = process.argv.includes('--debug');

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

const REASON_LABEL: Record<FreeModelRejection, string> = {
  INVALID_SHAPE: 'formato de pricing/architecture inesperado',
  ID_MISMATCH: 'el id no coincide',
  NOT_FREE_SUFFIX: 'no termina en ":free"',
  NONZERO_PRICE: 'alguna tarifa no es 0',
  NOT_TEXT: 'no acepta texto de entrada y salida'
};

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

function shortJson(value: unknown): string {

  const text = JSON.stringify(value) ?? String(value);

  return text.length > 400
    ? `${text.slice(0, 400)}…`
    : text;
}

async function main(): Promise<void> {

  console.log(`Consultando catálogo: ${CATALOG_URL}`);

  const models = await fetchCatalog();

  const free: string[] = [];

  const rejected: Array<{
    id: string;
    reason: FreeModelRejection;
    raw: unknown;
  }> = [];

  for (const item of models) {

    const parsedId = idSchema.safeParse(item);

    if (!parsedId.success) {
      continue;
    }

    const id = parsedId.data.id;
    const check = inspectFreeModel(item, id);

    if (check.ok) {

      free.push(id);

    } else {

      rejected.push({ id, reason: check.reason, raw: item });
    }
  }

  free.sort((a, b) => a.localeCompare(b));

  console.log('');
  console.log(`Modelos del catálogo: ${models.length}`);
  console.log(
    `Ids que terminan en ":free": ${
      models.filter((item) => {
        const parsed = idSchema.safeParse(item);
        return parsed.success && parsed.data.id.endsWith(':free');
      }).length
    }`
  );
  console.log(
    `Gratuitos verificados (texto, precio 0): ${free.length}`
  );
  console.log('');

  // Resumen de descartes (solo los motivos relevantes)

  const byReason = new Map<FreeModelRejection, number>();

  for (const item of rejected) {
    byReason.set(item.reason, (byReason.get(item.reason) ?? 0) + 1);
  }

  console.log('Descartados por motivo:');

  for (const [reason, count] of byReason) {
    console.log(`  ${REASON_LABEL[reason]}: ${count}`);
  }

  console.log('');

  // Candidatos ":free" rechazados: lo más útil para diagnosticar

  const freeRejected = rejected.filter(
    (item) => item.id.endsWith(':free')
  );

  if (freeRejected.length > 0) {

    console.log(
      `Candidatos ":free" rechazados (${freeRejected.length}):`
    );

    for (const item of freeRejected.slice(0, 5)) {
      console.log(
        `  ${item.id} -> ${REASON_LABEL[item.reason]}`
      );
    }

    console.log('');

    if (DEBUG) {

      console.log('Ejemplos crudos (--debug):');

      for (const item of freeRejected.slice(0, 3)) {
        console.log(`  ${shortJson(item.raw)}`);
      }

      console.log('');
      console.log(
        'Copia este bloque y compártelo: describe el formato real del catálogo.'
      );
      console.log('');
    }
  }

  if (free.length === 0) {

    console.log(
      'No hay modelos gratuitos verificables en este momento.'
    );

    if (freeRejected.length > 0) {

      console.log(
        'Hay ids ":free" que no pasaron la verificación: revisa el detalle de arriba.'
      );

      console.log(
        'Diagnóstico del formato real: npm run models:list -- --debug'
      );

    } else {

      console.log(
        'El catálogo no contiene ids terminados en ":free" ahora mismo.'
      );
    }

    console.log('Usa AI_EXECUTION_MODE=mock mientras tanto.');
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

  } else if (!current.endsWith(':free')) {

    console.log(
      `Aviso: "${current}" no termina en ":free"; la API lo rechazará con FREE_MODEL_REQUIRED.`
    );

  } else if (!free.includes(current)) {

    console.log(
      `Aviso: "${current}" no aparece como gratuito verificado. No lo uses.`
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
