import { buildApp } from './app.js';

const port = Number(process.env['PORT'] ?? 3001);
const app = buildApp({ logger: true });

app.listen({ port, host: '0.0.0.0' }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
