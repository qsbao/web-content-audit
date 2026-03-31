import type { FastifyPluginAsync } from "fastify";
import type { AuditRequest, AuditResponse } from "@web-content-audit/shared";
import { loadAllRuleSets, findRuleSet } from "../rules/loader.js";
import { runAudit } from "../engine/orchestrator.js";

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: AuditRequest }>("/audit", async (request, reply) => {
    const { document, documentType, ruleSetId } = request.body;

    const ruleSets = loadAllRuleSets();
    const ruleSet = findRuleSet(ruleSets, {
      ruleSetId,
      documentType,
      title: document.title,
      url: document.url,
    });

    if (!ruleSet) {
      return reply.status(404).send({
        error: "No matching ruleset found",
        availableTypes: ruleSets.map((rs) => ({
          id: rs.id,
          documentType: rs.documentType,
          displayName: rs.displayName,
        })),
      });
    }

    const response = await runAudit(document, ruleSet);
    return response;
  });
};
