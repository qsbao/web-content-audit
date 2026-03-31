import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { auditRoutes } from "./routes/audit.js";
import { rulesetsRoutes } from "./routes/rulesets.js";

const server = Fastify({ logger: true });

await server.register(cors, {
  origin: true, // allow all origins (Chrome extension + localhost)
});

await server.register(auditRoutes, { prefix: "/api/v1" });
await server.register(rulesetsRoutes, { prefix: "/api/v1" });

server.get("/health", async () => ({ status: "ok" }));

const port = Number(process.env.PORT) || 3200;

try {
  await server.listen({ port, host: "0.0.0.0" });
  console.log(`Server running at http://localhost:${port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
