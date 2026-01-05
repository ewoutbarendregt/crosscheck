import Fastify from "fastify";
import {
  buildAuthConfigResponse,
  buildAuthenticator,
  loadAuthConfig,
} from "./auth.js";

const server = Fastify({ logger: true });
const authConfig = loadAuthConfig();
const authenticate = buildAuthenticator(authConfig);

server.get("/health", async () => ({ status: "ok" }));

server.get("/auth/config", async () => buildAuthConfigResponse(authConfig));

server.get(
  "/me",
  {
    preHandler: authenticate,
  },
  async (request) => ({
    oid: request.user?.oid,
    name: request.user?.name,
    email: request.user?.email,
    roles: request.user?.roles ?? [],
  }),
);

const port = Number(process.env.PORT ?? 4000);

try {
  await server.listen({ port, host: "0.0.0.0" });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
