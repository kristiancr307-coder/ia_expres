import 'dotenv/config';

import { createApp } from './app.js';

import { loadConfig } from './config/env.js';

// 1. Cargar y validar configuración

let config;

try {

  config = loadConfig();

} catch (error) {

  // Error de configuración: mostrar la causa y no arrancar

  console.error(
    '\n[CONFIG_ERROR] No se pudo iniciar la API.'
  );

  console.error(
    error instanceof Error
      ? error.message
      : String(error)
  );

  console.error(
    '\nRevisa tu archivo .env (puedes copiarlo con: cp .env.example .env).\n'
  );

  process.exit(1);
}

// 2. Construir aplicación Express

const app = createApp(config);

// 3. Iniciar servidor HTTP

const server = app.listen(
  config.PORT,
  config.HOST,
  () => {

    const base =
      config.HOST === '0.0.0.0'
        ? `http://localhost:${config.PORT}`
        : `http://${config.HOST}:${config.PORT}`;

    console.log('--------------------------------');

    console.log('AI Knowledge Assistant');

    console.log(`Modo: ${config.AI_EXECUTION_MODE}`);

    console.log(`Escuchando en: ${config.HOST}:${config.PORT}`);

    console.log(`Servidor: ${base}`);

    console.log(`Swagger UI: ${base}/docs/`);

    console.log('--------------------------------');
  }
);

// 4. Avisar si el puerto ya está ocupado

server.on('error', (error: NodeJS.ErrnoException) => {

  if (error.code === 'EADDRINUSE') {

    console.error(
      `\n[PORT_ERROR] El puerto ${config.PORT} ya está en uso.`
    );

    console.error(
      'Cierra el proceso anterior o cambia PORT en tu .env.\n'
    );

    process.exit(1);
  }

  throw error;
});
