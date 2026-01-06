import { randomUUID } from "node:crypto";
import Fastify, { type FastifyReply } from "fastify";
import {
  buildAuthConfigResponse,
  buildAuthenticator,
  loadAuthConfig,
} from "./auth.js";
import { getDomainContainer } from "./db.js";
import {
  type Category,
  type ContextualMemory,
  type CriteriaFramework,
  type Criterion,
  type Document,
  type DocumentExtraction,
  type Finding,
  type Run,
  type Standard,
  type StandardVersion,
  nowIso,
} from "./models.js";
import {
  buildExtractionRecord,
  computeSha256,
  extractWithDocumentIntelligence,
  extractWithVisionFallback,
  getDocumentIntelligenceVersion,
  getVisionVersion,
  uploadDocumentBlob,
} from "./ingestion.js";

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

const secured = { preHandler: authenticate };

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing or invalid ${field}`);
  }
  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isStandardContext(value: unknown): value is Standard["context"] {
  return value === "general" || value === "recruitment";
}

function suggestStandardContext(name: string, description?: string): Standard["context"] {
  const haystack = `${name} ${description ?? ""}`.toLowerCase();
  if (
    haystack.includes("recruitment") ||
    haystack.includes("hiring") ||
    haystack.includes("employment") ||
    haystack.includes("candidate") ||
    haystack.includes("job")
  ) {
    return "recruitment";
  }
  return "general";
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  return undefined;
}

async function createItem<T extends { id: string; type: string }>(item: T) {
  const container = await getDomainContainer();
  await container.items.create(item);
  return item;
}

async function readItem<T>(type: string, id: string) {
  const container = await getDomainContainer();
  try {
    const { resource } = await container.item(id, type).read<T>();
    return resource ?? null;
  } catch (error) {
    const status = (error as { code?: number }).code;
    if (status === 404) {
      return null;
    }
    throw error;
  }
}

async function replaceItem<T extends { id: string; type: string }>(item: T) {
  const container = await getDomainContainer();
  await container.item(item.id, item.type).replace(item);
  return item;
}

async function queryItems<T>(query: string, parameters?: { name: string; value: unknown }[]) {
  const container = await getDomainContainer();
  const { resources } = await container.items
    .query<T>({ query, parameters })
    .fetchAll();
  return resources;
}

async function findExtractionByHash(hash: string, version: string) {
  const results = await queryItems<DocumentExtraction>(
    "SELECT * FROM c WHERE c.type = 'documentExtraction' AND c.hash = @hash AND c.version = @version",
    [
      { name: "@hash", value: hash },
      { name: "@version", value: version },
    ],
  );
  return results[0] ?? null;
}

function badRequest(reply: FastifyReply, message: string) {
  reply.code(400);
  return reply.send({ error: message });
}

function notFound(reply: FastifyReply, message: string) {
  reply.code(404);
  return reply.send({ error: message });
}

function conflict(reply: FastifyReply, message: string) {
  reply.code(409);
  return reply.send({ error: message });
}

function requireHumanActor(request: { user?: { oid?: string; email?: string } }) {
  return request.user?.oid ?? request.user?.email ?? null;
}

function logRecruitmentEvent(event: string, details: Record<string, unknown>) {
  server.log.info({ event, ...details }, "Recruitment compliance event");
}

async function readStandardByVersion(standardVersionId: string) {
  const standardVersion = await readItem<StandardVersion>("standardVersion", standardVersionId);
  if (!standardVersion) {
    return { standard: null, standardVersion: null };
  }
  const standard = await readItem<Standard>("standard", standardVersion.standardId);
  return { standard, standardVersion };
}

async function triggerReapprovalForFramework(frameworkId: string, reason: string) {
  const criteria = await queryItems<Criterion>(
    "SELECT * FROM c WHERE c.type = 'criterion' AND c.frameworkId = @frameworkId AND c.approval.status = 'approved'",
    [{ name: "@frameworkId", value: frameworkId }],
  );

  const now = nowIso();
  await Promise.all(
    criteria.map(async (criterion) => {
      const updated: Criterion = {
        ...criterion,
        updatedAt: now,
        approval: {
          status: "pending",
          submittedBy: criterion.approval.submittedBy,
          submittedAt: criterion.approval.submittedAt,
          reapprovalRequiredAt: now,
          reapprovalReason: reason,
        },
      };
      await replaceItem(updated);
    }),
  );
}

async function triggerReapprovalForMemory(memoryId: string, reason: string) {
  const criteria = await queryItems<Criterion>(
    "SELECT * FROM c WHERE c.type = 'criterion' AND c.contextualMemoryId = @memoryId AND c.approval.status = 'approved'",
    [{ name: "@memoryId", value: memoryId }],
  );

  const now = nowIso();
  await Promise.all(
    criteria.map(async (criterion) => {
      const updated: Criterion = {
        ...criterion,
        updatedAt: now,
        approval: {
          status: "pending",
          submittedBy: criterion.approval.submittedBy,
          submittedAt: criterion.approval.submittedAt,
          reapprovalRequiredAt: now,
          reapprovalReason: reason,
        },
      };
      await replaceItem(updated);
    }),
  );
}

server.post("/standards", secured, async (request, reply) => {
  try {
    const body = request.body as Record<string, unknown>;
    const name = requiredString(body.name, "name");
    const description = optionalString(body.description);
    const context = isStandardContext(body.context) ? body.context : undefined;
    if (!context) {
      reply.code(400);
      return reply.send({
        error: "Missing or invalid context",
        suggestedContext: suggestStandardContext(name, description),
      });
    }
    const contextConfirmed = Boolean(body.contextConfirmed);
    const contextSuggestion = suggestStandardContext(name, description);
    if (!contextConfirmed) {
      reply.code(409);
      return reply.send({
        error: "Context confirmation required",
        suggestedContext: contextSuggestion,
        providedContext: context,
      });
    }
    const now = nowIso();
    const standard: Standard = {
      id: randomUUID(),
      type: "standard",
      name,
      description,
      context,
      contextSuggestion,
      contextConfirmed,
      contextConfirmedAt: now,
      contextConfirmedBy: requireHumanActor(request) ?? "unknown",
      createdAt: now,
      updatedAt: now,
    };
    await createItem(standard);
    if (context === "recruitment") {
      logRecruitmentEvent("standard_created", {
        standardId: standard.id,
        name: standard.name,
        contextSuggestion,
        confirmedBy: standard.contextConfirmedBy,
      });
    }
    return standard;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.get("/standards/:id", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const standard = await readItem<Standard>("standard", id);
  if (!standard) {
    return notFound(reply, "Standard not found");
  }
  return standard;
});

server.get("/standards/:id/disclosure-templates", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const standard = await readItem<Standard>("standard", id);
  if (!standard) {
    return notFound(reply, "Standard not found");
  }
  if (standard.context !== "recruitment") {
    return conflict(reply, "Disclosure templates are only available for recruitment context");
  }

  const templates = [
    {
      id: "eu-ai-act-recruitment-notice",
      title: "EU AI Act Recruitment Transparency Notice",
      body:
        "This recruitment process uses AI-assisted evaluation tools. A qualified human reviewer " +
        "oversees decisions, and applicants can request information about the AI system's role.",
    },
    {
      id: "candidate-rights-summary",
      title: "Candidate Rights Summary",
      body:
        "Applicants may request human review, contest decisions, and receive information about " +
        "the data categories used in automated assessments.",
    },
  ];

  logRecruitmentEvent("disclosure_templates_exported", {
    standardId: standard.id,
    exportedAt: nowIso(),
  });

  return {
    standardId: standard.id,
    generatedAt: nowIso(),
    templates,
  };
});

server.post("/standards/:id/versions", secured, async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const standardId = requiredString(id, "standardId");
    const standard = await readItem<Standard>("standard", standardId);
    if (!standard) {
      return notFound(reply, "Standard not found");
    }

    const body = request.body as Record<string, unknown>;
    const version = requiredString(body.version, "version");
    const description = optionalString(body.description);
    const status = (optionalString(body.status) ?? "draft") as StandardVersion["status"];
    const frameworkId = optionalString(body.frameworkId);
    const now = nowIso();

    const standardVersion: StandardVersion = {
      id: randomUUID(),
      type: "standardVersion",
      standardId,
      version,
      description,
      status,
      frameworkId,
      createdAt: now,
      updatedAt: now,
    };

    await createItem(standardVersion);
    return standardVersion;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.get("/standards/:id/versions", secured, async (request) => {
  const { id } = request.params as { id: string };
  const standardId = id;
  return queryItems<StandardVersion>(
    "SELECT * FROM c WHERE c.type = 'standardVersion' AND c.standardId = @standardId",
    [{ name: "@standardId", value: standardId }],
  );
});

server.post("/criteria-frameworks", secured, async (request, reply) => {
  try {
    const body = request.body as Record<string, unknown>;
    const standardVersionId = requiredString(body.standardVersionId, "standardVersionId");
    const name = requiredString(body.name, "name");
    const description = optionalString(body.description);
    const content = optionalString(body.content);
    const now = nowIso();

    const framework: CriteriaFramework = {
      id: randomUUID(),
      type: "criteriaFramework",
      standardVersionId,
      name,
      description,
      content,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };

    await createItem(framework);
    return framework;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.get("/criteria-frameworks/:id", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const framework = await readItem<CriteriaFramework>("criteriaFramework", id);
  if (!framework) {
    return notFound(reply, "Criteria framework not found");
  }
  return framework;
});

server.put("/criteria-frameworks/:id", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const framework = await readItem<CriteriaFramework>("criteriaFramework", id);
  if (!framework) {
    return notFound(reply, "Criteria framework not found");
  }

  try {
    const body = request.body as Record<string, unknown>;
    const name = optionalString(body.name) ?? framework.name;
    const description = optionalString(body.description) ?? framework.description;
    const content = optionalString(body.content) ?? framework.content;
    const now = nowIso();

    const changed =
      name !== framework.name ||
      description !== framework.description ||
      content !== framework.content;

    const updated: CriteriaFramework = {
      ...framework,
      name,
      description,
      content,
      revision: changed ? framework.revision + 1 : framework.revision,
      updatedAt: now,
    };

    await replaceItem(updated);

    if (changed) {
      await triggerReapprovalForFramework(updated.id, "Criteria framework updated");
    }

    return updated;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.post("/categories", secured, async (request, reply) => {
  try {
    const body = request.body as Record<string, unknown>;
    const frameworkId = requiredString(body.frameworkId, "frameworkId");
    const name = requiredString(body.name, "name");
    const group = requiredString(body.group, "group");
    const description = optionalString(body.description);
    const order = parseNumber(body.order);
    const now = nowIso();

    const category: Category = {
      id: randomUUID(),
      type: "category",
      frameworkId,
      name,
      group,
      description,
      order,
      createdAt: now,
      updatedAt: now,
    };

    await createItem(category);
    return category;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.get("/categories/:id", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const category = await readItem<Category>("category", id);
  if (!category) {
    return notFound(reply, "Category not found");
  }
  return category;
});

server.put("/categories/:id", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const category = await readItem<Category>("category", id);
  if (!category) {
    return notFound(reply, "Category not found");
  }

  try {
    const body = request.body as Record<string, unknown>;
    const name = optionalString(body.name) ?? category.name;
    const group = requiredString(body.group ?? category.group, "group");
    const description = optionalString(body.description) ?? category.description;
    const order = parseNumber(body.order) ?? category.order;
    const now = nowIso();

    const updated: Category = {
      ...category,
      name,
      group,
      description,
      order,
      updatedAt: now,
    };

    await replaceItem(updated);
    return updated;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.post("/contextual-memories", secured, async (request, reply) => {
  try {
    const body = request.body as Record<string, unknown>;
    const frameworkId = requiredString(body.frameworkId, "frameworkId");
    const content = requiredString(body.content, "content");
    const label = optionalString(body.label);
    const now = nowIso();

    const memory: ContextualMemory = {
      id: randomUUID(),
      type: "contextualMemory",
      frameworkId,
      label,
      content,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };

    await createItem(memory);
    return memory;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.get("/contextual-memories/:id", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const memory = await readItem<ContextualMemory>("contextualMemory", id);
  if (!memory) {
    return notFound(reply, "Contextual memory not found");
  }
  return memory;
});

server.put("/contextual-memories/:id", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const memory = await readItem<ContextualMemory>("contextualMemory", id);
  if (!memory) {
    return notFound(reply, "Contextual memory not found");
  }

  try {
    const body = request.body as Record<string, unknown>;
    const label = optionalString(body.label) ?? memory.label;
    const content = optionalString(body.content) ?? memory.content;
    const now = nowIso();
    const changed = content !== memory.content || label !== memory.label;

    const updated: ContextualMemory = {
      ...memory,
      label,
      content,
      revision: changed ? memory.revision + 1 : memory.revision,
      updatedAt: now,
    };

    await replaceItem(updated);

    if (changed) {
      await triggerReapprovalForMemory(updated.id, "Contextual memory updated");
    }

    return updated;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.post("/criteria", secured, async (request, reply) => {
  try {
    const body = request.body as Record<string, unknown>;
    const frameworkId = requiredString(body.frameworkId, "frameworkId");
    const categoryId = requiredString(body.categoryId, "categoryId");
    const title = requiredString(body.title, "title");
    const description = optionalString(body.description);
    const contextualMemoryId = optionalString(body.contextualMemoryId);
    const now = nowIso();

    const criterion: Criterion = {
      id: randomUUID(),
      type: "criterion",
      frameworkId,
      categoryId,
      title,
      description,
      contextualMemoryId,
      approval: {
        status: "draft",
      },
      createdAt: now,
      updatedAt: now,
    };

    await createItem(criterion);
    return criterion;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.get("/criteria/:id", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const criterion = await readItem<Criterion>("criterion", id);
  if (!criterion) {
    return notFound(reply, "Criterion not found");
  }
  return criterion;
});

server.put("/criteria/:id", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const criterion = await readItem<Criterion>("criterion", id);
  if (!criterion) {
    return notFound(reply, "Criterion not found");
  }

  if (criterion.approval.status === "approved" || criterion.approval.status === "pending") {
    return conflict(reply, "Criterion cannot be edited while pending or approved");
  }

  try {
    const body = request.body as Record<string, unknown>;
    const title = optionalString(body.title) ?? criterion.title;
    const description = optionalString(body.description) ?? criterion.description;
    const categoryId = optionalString(body.categoryId) ?? criterion.categoryId;
    const contextualMemoryId = optionalString(body.contextualMemoryId) ?? criterion.contextualMemoryId;
    const now = nowIso();

    const updated: Criterion = {
      ...criterion,
      title,
      description,
      categoryId,
      contextualMemoryId,
      updatedAt: now,
    };

    await replaceItem(updated);
    return updated;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.post("/criteria/:id/submit", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const criterion = await readItem<Criterion>("criterion", id);
  if (!criterion) {
    return notFound(reply, "Criterion not found");
  }

  if (criterion.approval.status !== "draft" && criterion.approval.status !== "rejected") {
    return conflict(reply, "Criterion cannot be submitted in its current state");
  }

  const now = nowIso();
  const updated: Criterion = {
    ...criterion,
    updatedAt: now,
    approval: {
      status: "pending",
      submittedBy: request.user?.oid ?? request.user?.email ?? "system",
      submittedAt: now,
    },
  };

  await replaceItem(updated);
  return updated;
});

server.post("/criteria/:id/approve", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const criterion = await readItem<Criterion>("criterion", id);
  if (!criterion) {
    return notFound(reply, "Criterion not found");
  }

  if (criterion.approval.status !== "pending") {
    return conflict(reply, "Criterion is not pending approval");
  }

  const approvedBy = requireHumanActor(request);
  if (!approvedBy) {
    return conflict(reply, "Human-in-the-loop required for approvals");
  }

  const now = nowIso();
  const updated: Criterion = {
    ...criterion,
    updatedAt: now,
    approval: {
      status: "approved",
      submittedBy: criterion.approval.submittedBy,
      submittedAt: criterion.approval.submittedAt,
      approvedBy,
      approvedAt: now,
    },
  };

  await replaceItem(updated);
  return updated;
});

server.post("/criteria/:id/reject", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const criterion = await readItem<Criterion>("criterion", id);
  if (!criterion) {
    return notFound(reply, "Criterion not found");
  }

  if (criterion.approval.status !== "pending") {
    return conflict(reply, "Criterion is not pending approval");
  }

  const body = request.body as Record<string, unknown>;
  const reason = optionalString(body.reason);
  const rejectedBy = requireHumanActor(request);
  if (!rejectedBy) {
    return conflict(reply, "Human-in-the-loop required for rejections");
  }
  const now = nowIso();
  const updated: Criterion = {
    ...criterion,
    updatedAt: now,
    approval: {
      status: "rejected",
      submittedBy: criterion.approval.submittedBy,
      submittedAt: criterion.approval.submittedAt,
      rejectedBy,
      rejectedAt: now,
      rejectionReason: reason,
    },
  };

  await replaceItem(updated);
  return updated;
});

server.post("/runs", secured, async (request, reply) => {
  try {
    const body = request.body as Record<string, unknown>;
    const standardVersionId = requiredString(body.standardVersionId, "standardVersionId");
    const frameworkId = requiredString(body.frameworkId, "frameworkId");
    const metadata = (typeof body.metadata === "object" && body.metadata !== null
      ? (body.metadata as Record<string, unknown>)
      : undefined);
    const now = nowIso();

    const run: Run = {
      id: randomUUID(),
      type: "run",
      standardVersionId,
      frameworkId,
      status: "in_progress",
      startedAt: now,
      metadata,
      createdAt: now,
      updatedAt: now,
    };

    await createItem(run);
    const { standard } = await readStandardByVersion(standardVersionId);
    if (standard?.context === "recruitment") {
      logRecruitmentEvent("run_started", {
        runId: run.id,
        standardId: standard.id,
        standardVersionId,
        frameworkId,
        initiatedBy: requireHumanActor(request) ?? "unknown",
      });
    }
    return run;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.put("/runs/:id", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const run = await readItem<Run>("run", id);
  if (!run) {
    return notFound(reply, "Run not found");
  }

  try {
    const body = request.body as Record<string, unknown>;
    const status = (optionalString(body.status) as Run["status"]) ?? run.status;
    const completedAt = status === "completed" ? nowIso() : run.completedAt;
    const metadata = (typeof body.metadata === "object" && body.metadata !== null
      ? (body.metadata as Record<string, unknown>)
      : run.metadata);

    const updated: Run = {
      ...run,
      status,
      completedAt,
      metadata,
      updatedAt: nowIso(),
    };

    await replaceItem(updated);
    return updated;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.get("/runs/:id/bias-diagnostics", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const run = await readItem<Run>("run", id);
  if (!run) {
    return notFound(reply, "Run not found");
  }

  const { standard } = await readStandardByVersion(run.standardVersionId);
  if (!standard) {
    return notFound(reply, "Standard not found");
  }

  if (standard.context !== "recruitment") {
    return conflict(reply, "Bias diagnostics are only available for recruitment context");
  }

  const findings = await queryItems<Finding>(
    "SELECT * FROM c WHERE c.type = 'finding' AND c.runId = @runId",
    [{ name: "@runId", value: run.id }],
  );

  const latestByFinding = new Map<string, Finding>();
  for (const finding of findings) {
    const current = latestByFinding.get(finding.findingId);
    if (!current || finding.version > current.version) {
      latestByFinding.set(finding.findingId, finding);
    }
  }

  const aggregates = {
    totalFindings: latestByFinding.size,
    statusCounts: {
      open: 0,
      resolved: 0,
      dismissed: 0,
    },
  };

  for (const finding of latestByFinding.values()) {
    aggregates.statusCounts[finding.status] += 1;
  }

  logRecruitmentEvent("bias_diagnostics_requested", {
    runId: run.id,
    standardId: standard.id,
    totalFindings: aggregates.totalFindings,
  });

  return {
    runId: run.id,
    standardId: standard.id,
    generatedAt: nowIso(),
    aggregates,
  };
});

server.post("/runs/:runId/findings", secured, async (request, reply) => {
  try {
    const { runId } = request.params as { runId: string };
    const parsedRunId = requiredString(runId, "runId");
    const body = request.body as Record<string, unknown>;
    const criterionId = requiredString(body.criterionId, "criterionId");
    const status = (optionalString(body.status) as Finding["status"]) ?? "open";
    const evidence = optionalString(body.evidence);
    const notes = optionalString(body.notes);
    const now = nowIso();
    const findingId = randomUUID();

    const finding: Finding = {
      id: `${findingId}:1`,
      type: "finding",
      findingId,
      runId: parsedRunId,
      criterionId,
      version: 1,
      status,
      evidence,
      notes,
      createdAt: now,
      updatedAt: now,
    };

    await createItem(finding);
    return finding;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.get("/findings/:findingId", secured, async (request) => {
  const { findingId } = request.params as { findingId: string };
  return queryItems<Finding>(
    "SELECT * FROM c WHERE c.type = 'finding' AND c.findingId = @findingId ORDER BY c.version DESC",
    [{ name: "@findingId", value: findingId }],
  );
});

server.post("/documents/ingest", secured, async (request, reply) => {
  try {
    const body = request.body as Record<string, unknown>;
    const fileName = requiredString(body.fileName, "fileName");
    const contentBase64 = requiredString(body.contentBase64, "contentBase64");
    const contentType = optionalString(body.contentType) ?? "application/octet-stream";
    const allowFallback = Boolean(body.allowFallback);

    const buffer = Buffer.from(contentBase64, "base64");
    if (!buffer.length) {
      return badRequest(reply, "contentBase64 is empty");
    }

    const sha256 = computeSha256(buffer);
    const { blobUrl } = await uploadDocumentBlob({
      data: buffer,
      fileName,
      contentType,
    });

    const now = nowIso();
    const document: Document = {
      id: randomUUID(),
      type: "document",
      fileName,
      contentType,
      sizeBytes: buffer.length,
      sha256,
      blobUrl,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    };

    await createItem(document);

    const { version: diVersion } = getDocumentIntelligenceVersion();
    const cachedDi = await findExtractionByHash(sha256, diVersion);

    const applyExtraction = async (extraction: DocumentExtraction) => {
      const updated: Document = {
        ...document,
        status: "extracted",
        extractionId: extraction.id,
        extractionVersion: extraction.version,
        fallbackUsed: extraction.fallbackUsed,
        updatedAt: nowIso(),
      };
      await replaceItem(updated);
      return updated;
    };

    if (cachedDi) {
      const updated = await applyExtraction(cachedDi);
      return { document: updated, extraction: cachedDi, cached: true };
    }

    try {
      const diResult = await extractWithDocumentIntelligence(buffer);
      const extraction = buildExtractionRecord({
        hash: sha256,
        version: diResult.version,
        extractedText: diResult.extractedText,
        fallbackUsed: false,
        source: diResult.source,
      });
      await createItem(extraction);
      const updated = await applyExtraction(extraction);
      return { document: updated, extraction, cached: false };
    } catch (error) {
      if (!allowFallback) {
        const updated: Document = {
          ...document,
          status: "failed",
          extractionError: (error as Error).message,
          updatedAt: nowIso(),
        };
        await replaceItem(updated);
        reply.code(502);
        return reply.send({
          error: "Document Intelligence extraction failed; fallback not attempted.",
          details: updated.extractionError,
        });
      }

      const visionVersion = getVisionVersion();
      if (!visionVersion) {
        const updated: Document = {
          ...document,
          status: "failed",
          extractionError: "LLM vision fallback is not configured",
          updatedAt: nowIso(),
        };
        await replaceItem(updated);
        reply.code(502);
        return reply.send({
          error: "Document Intelligence extraction failed; fallback unavailable.",
          details: updated.extractionError,
        });
      }

      const cachedVision = await findExtractionByHash(sha256, visionVersion);
      if (cachedVision) {
        const updated = await applyExtraction(cachedVision);
        return { document: updated, extraction: cachedVision, cached: true };
      }

      try {
        const fallbackResult = await extractWithVisionFallback({
          buffer,
          contentType,
          fileName,
        });
        const extraction = buildExtractionRecord({
          hash: sha256,
          version: fallbackResult.version,
          extractedText: fallbackResult.extractedText,
          fallbackUsed: true,
          source: fallbackResult.source,
        });
        await createItem(extraction);
        const updated = await applyExtraction(extraction);
        return {
          document: updated,
          extraction,
          cached: false,
          fallbackUsed: true,
        };
      } catch (fallbackError) {
        const updated: Document = {
          ...document,
          status: "failed",
          extractionError: (fallbackError as Error).message,
          updatedAt: nowIso(),
        };
        await replaceItem(updated);
        reply.code(502);
        return reply.send({
          error: "Document Intelligence extraction failed; fallback failed.",
          details: updated.extractionError,
        });
      }
    }
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

server.get("/documents/:id", secured, async (request, reply) => {
  const { id } = request.params as { id: string };
  const document = await readItem<Document>("document", id);
  if (!document) {
    return notFound(reply, "Document not found");
  }
  return document;
});

server.put("/findings/:findingId", secured, async (request, reply) => {
  const { findingId } = request.params as { findingId: string };
  const versions = await queryItems<Finding>(
    "SELECT * FROM c WHERE c.type = 'finding' AND c.findingId = @findingId ORDER BY c.version DESC",
    [{ name: "@findingId", value: findingId }],
  );

  const latest = versions[0];
  if (!latest) {
    return notFound(reply, "Finding not found");
  }

  try {
    const body = request.body as Record<string, unknown>;
    const status = (optionalString(body.status) as Finding["status"]) ?? latest.status;
    const evidence = optionalString(body.evidence) ?? latest.evidence;
    const notes = optionalString(body.notes) ?? latest.notes;
    const now = nowIso();

    const next: Finding = {
      ...latest,
      id: `${findingId}:${latest.version + 1}`,
      version: latest.version + 1,
      status,
      evidence,
      notes,
      createdAt: now,
      updatedAt: now,
    };

    await createItem(next);
    return next;
  } catch (error) {
    return badRequest(reply, (error as Error).message);
  }
});

const port = Number(process.env.PORT ?? 4000);

try {
  await server.listen({ port, host: "0.0.0.0" });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
