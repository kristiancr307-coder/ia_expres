# Módulo 0 — Guion teórico

Respuestas conceptuales del proyecto `ai-knowledge-assistant`, listas para explicar en clase o en una defensa.
Cada una tiene: **la frase para decir**, **el porqué**, **la prueba en el repo** y **la analogía**.

---

## Mapa mental: el recorrido de una petición

```
POST /api/v1/ask  { "question": "..." }
   │
   ├─ server.ts ......... arranca (config + listen)
   ├─ app.ts ............ middlewares: requestId, JSON, rutas, 404, errores
   ├─ routes/ ........... mapa de URL  →  "esto va al controlador"
   ├─ controllers/ ...... valida con Zod + arma la respuesta HTTP
   ├─ services/ ......... decide el modo (mock | openrouter)
   ├─ ai/ ............... habla con el mundo: archivo local o internet
   └─ contracts/ ........ forma de los datos (entrada y salida)
```

**Las tres ideas que explican todo el módulo:**

1. **Separación de responsabilidades** — cada archivo hace una sola cosa.
2. **Un único contrato** — la forma de los datos se define en un solo lugar.
3. **Límites explícitos** — tiempo máximo, tamaño máximo, precio máximo (cero).

---

## 1. ¿Por qué `server.ts` y `app.ts` están separados?

**Para decir:** "`app.ts` *construye* la aplicación; `server.ts` la *arranca*. Construir es reutilizable y probable; arrancar es solo una decisión de despliegue."

**Por qué:**
- `app.ts` exporta `createApp(config, assistantService?)` y **nunca** llama a `listen()`: no abre puerto, no depende del sistema operativo.
- `server.ts` hace las tres cosas del arranque: leer `.env`, validar configuración y escuchar en un puerto.
- Esa separación permite **probar la app sin ocupar un puerto** (Supertest recibe la app directamente) y **inyectar un servicio falso** para no llamar a la IA real.
- También permite reutilizar la misma app en otro contexto: otro puerto, un test, un handler serverless.

**Prueba en el repo:**
- `src/app.ts:37` → `export function createApp(...)`
- `src/app.ts:39` → segundo parámetro `assistantService` con valor por defecto: punto de inyección.
- `src/server.ts:42` → `app.listen(...)` solo aquí.

**Analogía:** `app.ts` es la receta y el plato montado; `server.ts` es el mozo que lo saca a la mesa.

**Error típico a evitar:** poner `listen()` dentro de `app.ts`. Los tests se quedarían con el puerto abierto y no podrían ejecutarse en paralelo.

---

## 2. ¿Qué diferencia hay entre un router y un controlador?

**Para decir:** "El router es el **mapa**; el controlador es el **trabajador**. El router decide a dónde llega la petición; el controlador decide qué se hace con ella."

**Por qué:**
- El router solo asocia **método + ruta** con una función. No valida, no consulta, no decide.
- El controlador recibe la petición ya dirigida, valida el cuerpo, llama al servicio y construye el estado HTTP y el JSON de salida.
- Ventaja: cambiar una URL no obliga a tocar la lógica, y cambiar la lógica no obliga a tocar las URLs.

**Prueba en el repo:**
- `src/routes/ask.routes.ts:11` → `createAskRoutes()` solo hace `router.post('/', controller)` (línea 21).
- `src/controllers/ask.controller.ts:25` → validación con Zod; `:50` → `res.status(200).json(...)`.

**Analogía:** el router es el índice de un libro; el controlador es el capítulo que realmente se lee.

**Dato fino:** en este proyecto ambos son **fábricas** (`create...Routes`, `create...Controller`), no objetos globales. Así reciben sus dependencias por parámetro y no importan variables sueltas.

---

## 3. ¿Qué responsabilidad cumple `assistant.service.ts`?

**Para decir:** "Es el que **elige el modo de ejecución** y esconde el proveedor detrás de una función con una firma fija."

**Por qué:**
- Define el contrato `AssistantService = (question: string) => Promise<AskResult>`. Quien lo usa no sabe si detrás hay un archivo local o una API externa.
- Su lógica es un `if`: si el modo es `mock`, responde el generador simulado; si no, llama a OpenRouter.
- Ese único punto de decisión es lo que hace que el resto del sistema **no se entere** de dónde viene la respuesta, y lo que permite sustituirlo por un doble en las pruebas.

**Prueba en el repo:**
- `src/services/assistant.service.ts:15` → tipo `AssistantService`.
- `src/services/assistant.service.ts:27` → `if (config.AI_EXECUTION_MODE === 'mock')`.

**Analogía:** es el conmutador de vías del tren: el pasajero (el controlador) siempre va al mismo andén, el servicio decide por qué vía circula.

**Frase clave:** el servicio **no sabe HTTP** (no conoce `req` ni `res`) y el controlador **no sabe de IA** (no conoce el proveedor). Esa ignorancia mutua es la buena arquitectura.

---

## 4. ¿Por qué el controlador no consulta OpenRouter directamente?

**Para decir:** "Porque el controlador es la capa HTTP, no la capa de IA. Si llamara al proveedor, tendría que saber de claves, timeouts, precios, códigos 429/401 y formatos de respuesta… y dejaría de ser probable."

**Por qué (cuatro razones):**
1. **Responsabilidad única:** validar y responder es trabajo suficiente.
2. **Testeabilidad:** con un servicio falso se prueba el controlador sin red ni claves.
3. **Intercambiabilidad:** si mañana se usa otro proveedor o un modelo local, el controlador no cambia ni una línea.
4. **Seguridad:** la clave de API queda en una sola capa, lejos de donde entra el dato del usuario.

**Prueba en el repo:**
- El controlador **no importa** `openrouter.ts`; solo importa el **tipo** `AssistantService` (`src/controllers/ask.controller.ts`), es decir, conoce el contrato, no la implementación.
- Todas las llamadas de red viven en `src/ai/openrouter.ts`.

**Analogía:** el mesero toma el pedido y lo sirve; no entra a la cocina a cocinar. Si cada mesero cocinara, no habría restaurante que aguante un cambio de menú.

---

## 5. ¿Qué diferencia hay entre un tipo TypeScript y una validación Zod?

**Para decir:** "El tipo TypeScript existe **solo mientras compilas** y desaparece del JavaScript final; Zod existe **mientras el programa corre**, y por eso es el único que puede frenar datos reales."

**Por qué:**
- `interface AskResult` es una promesa que le haces al compilador; no genera ni una línea de código.
- Los datos que llegan por HTTP **no** fueron escritos por TypeScript: pueden ser `null`, un número, un objeto con campos extra. El tipo no puede detenerlos.
- Zod es una librería: crea un objeto real en memoria con `safeParse()` que devuelve `success` o el detalle del error.

**Prueba en el repo:**
- `src/contracts/ask.ts:5` → `askRequestSchema` (Zod, runtime): `trim`, `min(3)`, `max(1000)`, `.strict()`.
- `src/contracts/ask.ts:14` → `AskRequest = z.infer<typeof askRequestSchema>`: el **tipo se deriva del esquema**, así nunca se desincronizan.
- `src/controllers/ask.controller.ts:25` → `safeParse(req.body)`, y si falla, `400`.

**Analogía:** el tipo es el plano del edificio; Zod es el inspector que va a la obra a medir. El plano no detiene a nadie.

**Frase para cerrar:** "en los bordes del sistema se valida en ejecución; por dentro se confía en los tipos".

---

## 6. ¿Qué hace `await` cuando OpenRouter tarda en responder?

**Para decir:** "`await` no congela el servidor: solo pausa **esa** función. Node sigue atendiendo otras peticiones mientras la promesa se resuelve. Lo que sí limita la espera es el timeout."

**Por qué:**
- Node tiene un solo hilo, pero un event loop: mientras espera entrada/salida, atiende lo demás. Si el proveedor tarda 5 segundos, la API no deja de responder otras solicitudes.
- Lo que no puede pasar es esperar **para siempre**: por eso la petición lleva `AbortSignal.timeout(...)`. Al vencer, se aborta la llamada y el cliente recibe un error controlado, no una conexión colgada.
- Ese `await` está dentro de un manejador `async`; en Express 5, un `throw` en una promesa rechazada llega al middleware de errores sin necesidad de `try/catch`.

**Prueba en el repo:**
- `src/ai/openrouter.ts:117` → `signal: AbortSignal.timeout(timeoutMs)`.
- El valor sale de `REQUEST_TIMEOUT_MS` (por defecto 15 000 ms) y en caso de fallo se traduce a `503 UPSTREAM_NETWORK_ERROR`.
- `src/middlewares/error-handler.ts` centraliza la respuesta de error.

**Analogía:** es como pedir un café: esperas apoyado en la barra (tu función está en pausa) mientras el resto del local sigue funcionando. El timeout es el "si en 15 minutos no está, me voy".

**Error típico:** decir "`await` bloquea Node". No: bloquea la **función**, no el **proceso**.

---

## 7. ¿Qué archivo contiene el contrato de la respuesta HTTP?

**Para decir:** "El contrato de los datos está en `src/contracts/ask.ts`; el contrato del mensaje HTTP completo se publica en `docs/openapi.json`."

**Por qué son dos y no uno:**
- `src/contracts/ask.ts` define `AskResult`: `answer`, `mode`, `model`, `usage`. Es la **fuente de verdad en código**.
- El sobre HTTP (`data` + `meta.requestId`) y el sobre de error (`error.code`, `error.message`, `error.requestId`) se arman en el controlador y en el manejador de errores, y se **documentan** en `docs/openapi.json`.
- Separarlos permite cambiar el transporte (por ejemplo, un evento o un CLI) sin tocar el resultado de la inferencia.

**Prueba en el repo:**
- `src/contracts/ask.ts:20` → `interface AskResult`.
- `src/controllers/ask.controller.ts:50` → forma de la respuesta `{ data, meta: { requestId } }`.
- `docs/openapi.json` → esquemas `AskResponse` y `ErrorResponse`.

**Analogía:** el contrato de datos es lo que dice la factura; el sobre HTTP es el sobre con remitente y número de guía.

---

## 8. ¿Qué problema resuelve el documento OpenAPI?

**Para decir:** "Convierte la documentación en un **contrato legible por máquinas**, para que no exista la típica documentación que dice una cosa y la API que hace otra."

**Por qué importa:**
- **Una sola fuente:** endpoints, cuerpos, códigos de respuesta (`200`, `400`, `413`, `500`, `503`) y ejemplos viven en un archivo versionado junto al código.
- **Se puede ejecutar:** Swagger UI lo lee y genera un formulario para probar cada endpoint desde el navegador (`/docs/`).
- **Se puede consumir:** `/openapi.json` sirve para generar clientes, validar en CI o publicar la API a otros equipos.
- **Obliga a pensar en los errores:** al documentar `400` y `503` uno se da cuenta de que esos casos existen y deben tener forma definida.

**Prueba en el repo:**
- `docs/openapi.json` (OpenAPI 3.1) y su montaje en `src/app.ts` (`/openapi.json` y `/docs`).

**Analogía:** es el menú plastificado del restaurante: el mismo que el cliente lee y el que la cocina usa para saber qué platos existen.

**Límite honesto que conviene decir:** OpenAPI **documenta**, no valida. Si el código cambia y el archivo no, la documentación miente: por eso el contrato debe actualizarse en el mismo commit.

---

## 9. ¿Por qué una pregunta inválida no debe generar una inferencia?

**Para decir:** "Porque una inferencia cuesta dinero, cuota y tiempo, y una pregunta que ya sabemos inválida no merece ninguno de los tres."

**Por qué:**
- **Orden correcto:** validar primero, inferir después. El controlador valida **antes** de llamar al servicio.
- **Costo cero:** los tokens se pagan por enviar y por recibir; un `400` no consume nada.
- **Cuota protegida:** los modelos gratuitos tienen límite por minuto; gastarlo en basura deja sin servicio a los usuarios reales.
- **Seguridad:** no se envía a un tercero contenido que ni siquiera cumple el formato acordado.
- **Respuesta rápida y clara:** milisegundos y un código de error identificable (`VALIDATION_ERROR`) en vez de una espera de 10 segundos para acabar en error.

**Prueba en el repo:**
- `src/controllers/ask.controller.ts:25-40`: si `safeParse` falla, lanza `ApiError(400, 'VALIDATION_ERROR', ...)` y **nunca** llega a `await assistantService(...)`.
- Verificado en ejecución: `{"question":"ab"}` → `400` inmediato.

**Analogía:** no se enciende el horno para cocinar un plato que el cliente no pidió.

---

## 10. ¿Por qué las pruebas no deben consumir tokens reales?

**Para decir:** "Porque una prueba debe ser determinista, gratuita, rápida y segura; un LLM real no garantiza ninguna de las cuatro."

**Por qué (las cuatro razones):**
1. **Determinismo:** el modelo responde distinto cada vez. Un test que compara texto falla al azar ("flaky").
2. **Costo y cuota:** cada ejecución gasta; en CI, cientos de ejecuciones al día. Y un `429` rompe la build sin que el código esté mal.
3. **Seguridad:** CI no debe tener `OPENROUTER_API_KEY`; una clave en el pipeline es una clave filtrable.
4. **Velocidad y aislamiento:** milisegundos contra segundos, y la prueba falla por tu código, no por el proveedor caído.

**Cómo se logra (esto es lo importante):**
- El modo `mock` **no toca la red**: lee un archivo local (`fixtures/mock-response.json`).
- `createApp(config, assistantService)` permite **inyectar un doble** que devuelve una respuesta fija.
- La prueba contra el proveedor real queda como un **comando manual y explícito**, separado de la suite.

**Prueba en el repo:**
- `src/ai/mock.ts` → usa `readFileSync`, cero `fetch`.
- `src/app.ts:39` → punto de inyección del servicio.

**Analogía:** para probar que una calculadora suma bien no se llama a un contador humano por teléfono.

---

## 11. ¿Cómo se evita seleccionar un modelo de pago accidentalmente?

**Para decir:** "Con tres filtros acumulativos: la configuración exige que el id termine en `:free`, el arranque lo verifica, y antes de **cada** petición se comprueba en el catálogo que las tres tarifas sean cero. Si algo no cuadra, la API **falla**; nunca degrada a un modelo pagado."

**Los tres filtros:**
1. **En configuración:** en modo `openrouter`, `loadConfig()` exige `OPENROUTER_API_KEY` y un `OPENROUTER_MODEL` que termine en `:free`.
2. **Antes de pedir:** `verifyFreeModel()` consulta el catálogo en vivo y busca ese `id`.
3. **Por cada tarifa:** `isVerifiedFreeTextModel()` exige precio `0` en `prompt`, `completion` y `request`, y que el modelo acepte texto de entrada y de salida.

**Por qué "fallar" es la decisión correcta:** un *fallback* silencioso a un modelo pago resolvería el síntoma (siempre responde) y crearía el problema real (factura sorpresa). En una política de solo-gratis, el error es la característica.

**Prueba en el repo:**
- `src/ai/openrouter.ts` → `isZeroPrice`, `isVerifiedFreeTextModel`, `verifyFreeModel`; errores `FREE_MODEL_REQUIRED` y `FREE_MODEL_UNAVAILABLE`.
- `src/config/env.ts` → validación del sufijo `:free` al arrancar.
- Verificado: `openrouter/free` y `openai/gpt-4o` **no arrancan**; un id `:free` inexistente devuelve `503`, sin fallback.

**Analogía:** es un portero que, si no encuentra tu nombre en la lista, no te deja pasar ni te cobra la entrada "por si acaso".

---

## Cómo defenderlo en 60 segundos

> "La API está dividida en capas: `server.ts` arranca, `app.ts` construye, el router mapea, el controlador valida y responde, el servicio decide y `ai/` habla con el proveedor. Los tipos protegen al programador en compilación; Zod protege al servidor en ejecución. La red tiene límites: tamaño de cuerpo, timeout y precio cero verificado antes de cada llamada. Y como cada pieza se puede sustituir, todo se prueba sin internet, sin claves y sin gastar tokens."

---

## Preguntas trampa y respuesta corta

| Pregunta | Respuesta |
|---|---|
| ¿Por qué no hay `try/catch` en el controlador? | Express 5 propaga los rechazos de promesas al middleware de errores. |
| ¿El `requestId` identifica al usuario? | No: identifica la **petición**. No es autenticación. |
| ¿El modo mock mide calidad del modelo? | No: es un fixture fijo, no un benchmark. |
| ¿`usage` en mock es cero? | Es `null`, para no fingir métricas que no existen. |
| ¿Quién decide el modo, el controlador o el servicio? | El servicio, leyendo `AI_EXECUTION_MODE`. El controlador lo ignora. |
