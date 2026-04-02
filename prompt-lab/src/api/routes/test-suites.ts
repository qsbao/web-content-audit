import type { FastifyInstance } from "fastify";
import {
  loadAllTestSuites,
  loadTestSuiteForRule,
  saveTestSuite,
  deleteTestSuite,
} from "../../runner/suite-loader.js";
import type { TestSuite, TestCase } from "../../types.js";

export async function testSuitesRoutes(app: FastifyInstance) {
  // List all test suites
  app.get("/api/v1/test-suites", async () => {
    return loadAllTestSuites();
  });

  // Get specific test suite
  app.get<{ Params: { ruleSetId: string; ruleId: string } }>(
    "/api/v1/test-suites/:ruleSetId/:ruleId",
    async (req, reply) => {
      const suite = loadTestSuiteForRule(req.params.ruleSetId, req.params.ruleId);
      if (!suite) return reply.status(404).send({ error: "Test suite not found" });
      return suite;
    }
  );

  // Create a new test suite
  app.post<{ Body: TestSuite }>("/api/v1/test-suites", async (req) => {
    const suite = req.body;
    saveTestSuite(suite);
    return { ok: true, ruleSetId: suite.ruleSetId, ruleId: suite.ruleId };
  });

  // Update a test suite
  app.put<{ Params: { ruleSetId: string; ruleId: string }; Body: TestSuite }>(
    "/api/v1/test-suites/:ruleSetId/:ruleId",
    async (req) => {
      const suite = { ...req.body, ruleSetId: req.params.ruleSetId, ruleId: req.params.ruleId };
      saveTestSuite(suite);
      return { ok: true };
    }
  );

  // Delete a test suite
  app.delete<{ Params: { ruleSetId: string; ruleId: string } }>(
    "/api/v1/test-suites/:ruleSetId/:ruleId",
    async (req, reply) => {
      const deleted = deleteTestSuite(req.params.ruleSetId, req.params.ruleId);
      if (!deleted) return reply.status(404).send({ error: "Test suite not found" });
      return { ok: true };
    }
  );

  // Add a test case to a suite
  app.post<{ Params: { ruleSetId: string; ruleId: string }; Body: TestCase }>(
    "/api/v1/test-suites/:ruleSetId/:ruleId/cases",
    async (req, reply) => {
      const suite = loadTestSuiteForRule(req.params.ruleSetId, req.params.ruleId);
      if (!suite) return reply.status(404).send({ error: "Test suite not found" });

      const existing = suite.cases.find((c) => c.id === req.body.id);
      if (existing) return reply.status(409).send({ error: `Case '${req.body.id}' already exists` });

      suite.cases.push(req.body);
      saveTestSuite(suite);
      return { ok: true, caseId: req.body.id };
    }
  );

  // Update a test case
  app.put<{ Params: { ruleSetId: string; ruleId: string; caseId: string }; Body: TestCase }>(
    "/api/v1/test-suites/:ruleSetId/:ruleId/cases/:caseId",
    async (req, reply) => {
      const suite = loadTestSuiteForRule(req.params.ruleSetId, req.params.ruleId);
      if (!suite) return reply.status(404).send({ error: "Test suite not found" });

      const idx = suite.cases.findIndex((c) => c.id === req.params.caseId);
      if (idx === -1) return reply.status(404).send({ error: "Test case not found" });

      suite.cases[idx] = { ...req.body, id: req.params.caseId };
      saveTestSuite(suite);
      return { ok: true };
    }
  );

  // Delete a test case
  app.delete<{ Params: { ruleSetId: string; ruleId: string; caseId: string } }>(
    "/api/v1/test-suites/:ruleSetId/:ruleId/cases/:caseId",
    async (req, reply) => {
      const suite = loadTestSuiteForRule(req.params.ruleSetId, req.params.ruleId);
      if (!suite) return reply.status(404).send({ error: "Test suite not found" });

      const idx = suite.cases.findIndex((c) => c.id === req.params.caseId);
      if (idx === -1) return reply.status(404).send({ error: "Test case not found" });

      suite.cases.splice(idx, 1);
      saveTestSuite(suite);
      return { ok: true };
    }
  );
}
