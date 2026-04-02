import type { FastifyInstance } from "fastify";
import { loadAllRuleSets, getContentRules } from "../../runner/rule-loader.js";

export async function rulesetsRoutes(app: FastifyInstance) {
  app.get("/api/v1/rulesets", async () => {
    const ruleSets = loadAllRuleSets();
    return ruleSets.map((rs) => ({
      id: rs.id,
      documentType: rs.documentType,
      displayName: rs.displayName,
      contentRules: getContentRules(rs).map((r) => ({
        id: r.id,
        description: r.description,
        severity: r.severity,
        targetSection: r.check.type === "content" ? (r.check as any).targetSection : undefined,
        evaluationPrompt: r.check.type === "content" ? (r.check as any).evaluationPrompt : undefined,
      })),
    }));
  });
}
