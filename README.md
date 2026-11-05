# Módulo 0 — Express AI API Starter

Proyecto del curso **Ingeniería de IA con TypeScript, Express y OpenRouter**.

> Requisitos: Node.js 24 LTS, npm, Git, Visual Studio Code. La instalación inicial requiere internet. NO subir `.env` al repositorio. La API es una base didáctica; todavía no está expuesta a Internet ni tiene autenticación, rate limiting local o gestión empresarial de datos.

## 1. Instalación (PowerShell desde carpeta del repositorio)

```powershell
node -v
npm -v
npm install express@5 zod dotenv openai @openrouter/sdk
npm install -D typescript tsx @types/node @types/express vitest supertest @types/supertest eslint @eslint/js typescript-eslint prettier
Copy-Item .env.example .env
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

Las versiones concretas se resuelven al instalar y quedan fijadas en `package-lock.json`. Confirmar `npm ls --depth=0` y registrar los números en `docs/compatibility.md` antes de impartir. Si alguna actualización mayor rompe compatibilidad, fijar versiones compatibles y documentar la decisión.

### Bash

```bash
npm install express@5 zod dotenv openai @openrouter/sdk
npm install -D typescript tsx @types/node @types/express vitest supertest @types/supertest eslint @eslint/js typescript-eslint prettier
cp .env.example .env
npm run typecheck && npm run lint && npm test && npm run build
npm run dev
```

## 2. Laboratorio mock (sin inferencia externa)

En `.env`: `AI_EXECUTION_MODE=mock`.

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod -Uri http://localhost:3000/api/v1/ask -Method Post -ContentType 'application/json' -Body '{"question":"Explica un LLM"}'
```

Resultado esperado: `mode: "mock"`, `model: "mock/educational-v1"`, `usage: null`. Son datos simulados, nunca benchmarks. La interfaz interactiva esta en `http://localhost:3000/docs/`.

## 3. OpenRouter remoto (solo modelos gratuitos)

1. Crear clave en https://openrouter.ai/settings/keys y colocarla SOLO en `.env`.
2. Revisar precio y límites en https://openrouter.ai/pricing y el router gratuito en https://openrouter.ai/openrouter/free.
3. Cambiar `.env`: `AI_EXECUTION_MODE=openrouter` y poner la clave en `OPENROUTER_API_KEY`.
4. Consultar modelos gratuitos vigentes: `npm run models:list` (consulta el catálogo vivo y muestra solo modelos con precios prompt/completion/request iguales a cero y salida text). Copiar uno en `OPENROUTER_MODEL`; **el id debe terminar en `:free`**. Sin un id valido la API no arranca (`CONFIG_ERROR`).
5. Reiniciar servidor con `npm run dev` y probar en `/docs/` o con `POST /api/v1/ask`. Esperado: `mode: "openrouter"` y `usage` con conteo de tokens.
6. Prueba SDK oficial: `npm run sdk:probe` (solicitud real; respeta límites de cuota).
7. Probar `/api/v1/chat` con PowerShell como arriba.

No usar `openrouter/free`: ese id no termina en `:free`, no existe en el catálogo de modelos y la API lo rechaza. Hay que elegir un ID concreto, gratuito y vigente (`npm run models:list`). La API verifica las tres tarifas antes de cada petición; si el modelo deja de ser gratuito responde `FREE_MODEL_UNAVAILABLE` en vez de pasar a pago.

## 4. Ollama local (opcional)

Instalar Ollama siguiendo https://ollama.com/download y ejecutar:

```powershell
ollama pull qwen2.5:0.5b
ollama list
```

Colocar en `.env` `AI_EXECUTION_MODE=local` y `AI_LOCAL_MODEL=qwen2.5:0.5b`; reiniciar la API. Primer uso puede necesitar descargar el modelo y consumir RAM/CPU. Si el modelo no está instalado, la API devuelve error controlado, NO cambia automáticamente a OpenRouter.

## 5. Pruebas, compilación y calidad

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm start
```

No hay consultas remotas en `npm test`. Vitest + Supertest inyecta un proveedor fake. `docs/openapi.json` describe endpoints. CI requiere `package-lock.json`: generar con `npm install` y versionar antes del push.

## 6. Git: ramas y commits sugeridos

```powershell
git init
git switch -c feat/module-0-starter
git add .
git status
git commit -m "feat(m0): bootstrap typescript express ai starter"
```

Crear commits adicionales por API, validación, conexión OpenRouter y pruebas. Nunca agregar `.env` ni claves API.

## 7. Seguridad y límites actuales

- No subir credenciales ni datos sensibles a OpenRouter.
- No exponer esta API directamente a Internet. No tiene auth, quotas propias ni control anti-abuso; se agregan en etapas posteriores.
- No confiar en `requestId` como identidad del usuario.
- En `FREE_ONLY` no usar IDs facturables ni cambiar a un proveedor pago por fallback.
- Timeout en cliente remoto; respuesta sin contenido se trata como error.
- La selección de modelos gratuitos puede cambiar; la ruta mock siempre funciona sin claves.
- OpenAPI documenta el contrato de alto nivel; ampliar esquemas y respuestas a medida que evolucione el curso.

## 8. Problemas frecuentes

- `node` no encontrado: reinstalar Node LTS y abrir una terminal nueva.
- Dependencias faltantes: ejecutar los dos `npm install` anteriores.
- `npm ci` falla: todavía no se generó/commitió `package-lock.json`.
- `CONFIG_ERROR`: falta `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` o el modelo no termina en `:free`.
- `PORT_ERROR`: el puerto ya está en uso.
- `UPSTREAM_RATE_LIMIT` 429: esperar o pasar explícitamente a mock/local; no omitir política gratuita.
- `FREE_MODEL_REQUIRED`: `OPENROUTER_MODEL` no termina en `:free`.
- `FREE_MODEL_UNAVAILABLE`: el modelo no está en el catálogo, cambió de precio o no acepta texto.
- `LOCAL_UNAVAILABLE`: comprobar `ollama list`, servidor y nombre de modelo.
- `INVALID_JSON` 400: cuerpo JSON mal formado; `VALIDATION_ERROR` 400: `question` no cumple esquema.
- Puertos ocupados: cambiar `PORT` en `.env`.

## 9. Alcance y próximos pasos

En M0 la llamada es directa desde la API y la elección de modo se mantiene mínima. M1 extraerá un `LLMService` tipado; M7 añadirá el Model Gateway y políticas dinámicas. Se conserva el mismo repositorio hasta el M14.
