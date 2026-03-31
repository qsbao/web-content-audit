import type { FastifyPluginAsync } from "fastify";
import { loadAllRuleSets } from "../rules/loader.js";

export const rulesetsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/rulesets", async () => {
    return loadAllRuleSets();
  });
};
