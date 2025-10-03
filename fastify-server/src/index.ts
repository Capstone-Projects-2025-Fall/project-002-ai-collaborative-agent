// src/index.ts
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

const app = Fastify({ logger: true });

// Docs (minimal OpenAPI)
app.register(swagger, {
  openapi: {
    info: { title: 'API', version: '1.0.0' },
    servers: [{ url: '/' }]
  }
});
app.register(swaggerUI, { routePrefix: '/docs' });

// One demo route
app.get('/hello', {
  schema: {
    summary: 'Hello',
    response: { 200: { type: 'object', properties: { message: { type: 'string' } } } }
  }
}, async () => ({ message: 'Hello, world!' }));

// Health (optional)
app.get('/health', async () => ({ ok: true }));

// Start
const port = Number(process.env.PORT ?? 5000);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
