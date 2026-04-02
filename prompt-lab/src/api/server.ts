import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { rulesetsRoutes } from "./routes/rulesets.js";
import { testSuitesRoutes } from "./routes/test-suites.js";
import { runsRoutes } from "./routes/runs.js";
import { optimizeRoutes } from "./routes/optimize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Serve dashboard static files
await app.register(fastifyStatic, {
  root: path.resolve(__dirname, "../dashboard"),
  prefix: "/",
});

// API routes
await app.register(rulesetsRoutes);
await app.register(testSuitesRoutes);
await app.register(runsRoutes);
await app.register(optimizeRoutes);

app.get("/health", async () => ({ status: "ok" }));

const port = Number(process.env.PROMPT_LAB_PORT) || 3201;
app.listen({ port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`Prompt Lab running at ${address}`);
});
