// src/index.ts
import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import fastifyAuth0Verify from 'fastify-auth0-verify';
import type { FastifyPluginAsync } from 'fastify';


// The plugin doesn't export a named options type in some versions, so declare a local interface
interface FastifyAuth0VerifyOptions {
  domain: string;
  audience: string | string[];
  signingAlg?: string;
}

const app = Fastify({ logger: true });

app.register(swagger, {
  openapi: {
    info: { title: 'API', version: '1.0.0' },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    }
    // If you want EVERY route to require auth in the docs, add:
    // , security: [{ bearerAuth: [] }]
  }
});
app.register(swaggerUI, { routePrefix: '/docs' });

// Redirects / to /docs
app.get('/', { schema: { hide: true } }, (_req, reply) => reply.redirect('/docs'));

// Cast the imported plugin to the expected Fastify plugin type so TypeScript accepts the options
app.register(fastifyAuth0Verify as FastifyPluginAsync<FastifyAuth0VerifyOptions>, {
  domain: process.env.AUTH0_DOMAIN!,            // e.g. "your-tenant.us.auth0.com"
  audience: process.env.AUTH0_AUDIENCE!,        // e.g. "https://your-api-identifier"
  signingAlg: 'RS256'
});

// Demo route
app.get('/hello', {
  schema: {
    summary: 'Hello',
    response: { 200: { type: 'object', properties: { message: { type: 'string' } } } }
  }
}, async () => ({ message: 'Hello, world!' }));

// Health Route
app.get('/health', async () => ({ ok: true }));

// Start
const port = Number(process.env.PORT ?? 5000);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
