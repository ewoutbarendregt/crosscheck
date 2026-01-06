import { ServiceBusClient, type ServiceBusReceivedMessage } from "@azure/service-bus";
import Ajv, { type JSONSchemaType } from "ajv";

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const serviceBusConnectionString = requiredEnv("SERVICE_BUS_CONNECTION_STRING");
const reasoningQueueName = requiredEnv("REASONING_QUEUE_NAME");
const outputQueueName = requiredEnv("REASONING_OUTPUT_QUEUE_NAME");
const foundryEndpoint = requiredEnv("AZURE_AI_FOUNDRY_ENDPOINT");
const foundryApiKey = requiredEnv("AZURE_AI_FOUNDRY_API_KEY");
const foundryDeployment = requiredEnv("AZURE_AI_FOUNDRY_DEPLOYMENT");
const foundryApiVersion = process.env.AZURE_AI_FOUNDRY_API_VERSION ?? "2024-02-15-preview";
const maxConcurrentCalls = Number(process.env.REASONING_CONCURRENCY ?? 4);

interface ReasoningJob {
  jobId: string;
  claim: string;
  context: {
    documents: Array<{ id: string; content: string }>;
  };
  criteria: Array<{ id: string; description: string }>;
}

interface RetrievalResult {
  documents: Array<{ id: string; summary: string; relevance: number }>;
}

interface MatchingResult {
  matches: Array<{
    criterionId: string;
    documentId: string;
    evidence: string;
    score: number;
  }>;
}

interface FindingGenerationResult {
  findings: Array<{
    id: string;
    summary: string;
    severity: "low" | "medium" | "high";
    supportingEvidence: string[];
  }>;
}

interface AgreementScoringResult {
  agreements: Array<{
    findingId: string;
    agreementScore: number;
    rationale: string;
  }>;
}

interface CategorySynthesisResult {
  categories: Array<{
    name: string;
    rationale: string;
    findingIds: string[];
  }>;
}

interface OverallAssessmentResult {
  assessment: {
    overallScore: number;
    summary: string;
    riskLevel: "low" | "medium" | "high";
    recommendation: string;
  };
}

interface PipelineResult {
  jobId: string;
  retrieval: RetrievalResult;
  matching: MatchingResult;
  findingGeneration: FindingGenerationResult;
  agreementScoring: AgreementScoringResult;
  categorySynthesis: CategorySynthesisResult;
  overallAssessment: OverallAssessmentResult;
}

const ajv = new Ajv({ allErrors: true, strict: false });

const jobSchema: JSONSchemaType<ReasoningJob> = {
  type: "object",
  properties: {
    jobId: { type: "string" },
    claim: { type: "string" },
    context: {
      type: "object",
      properties: {
        documents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              content: { type: "string" },
            },
            required: ["id", "content"],
            additionalProperties: false,
          },
          minItems: 1,
        },
      },
      required: ["documents"],
      additionalProperties: false,
    },
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "description"],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ["jobId", "claim", "context", "criteria"],
  additionalProperties: false,
};

const retrievalSchema: JSONSchemaType<RetrievalResult> = {
  type: "object",
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          summary: { type: "string" },
          relevance: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["id", "summary", "relevance"],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ["documents"],
  additionalProperties: false,
};

const matchingSchema: JSONSchemaType<MatchingResult> = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterionId: { type: "string" },
          documentId: { type: "string" },
          evidence: { type: "string" },
          score: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["criterionId", "documentId", "evidence", "score"],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ["matches"],
  additionalProperties: false,
};

const findingGenerationSchema: JSONSchemaType<FindingGenerationResult> = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          summary: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          supportingEvidence: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
        },
        required: ["id", "summary", "severity", "supportingEvidence"],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ["findings"],
  additionalProperties: false,
};

const agreementScoringSchema: JSONSchemaType<AgreementScoringResult> = {
  type: "object",
  properties: {
    agreements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          findingId: { type: "string" },
          agreementScore: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string" },
        },
        required: ["findingId", "agreementScore", "rationale"],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ["agreements"],
  additionalProperties: false,
};

const categorySynthesisSchema: JSONSchemaType<CategorySynthesisResult> = {
  type: "object",
  properties: {
    categories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          rationale: { type: "string" },
          findingIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
        },
        required: ["name", "rationale", "findingIds"],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ["categories"],
  additionalProperties: false,
};

const overallAssessmentSchema: JSONSchemaType<OverallAssessmentResult> = {
  type: "object",
  properties: {
    assessment: {
      type: "object",
      properties: {
        overallScore: { type: "number", minimum: 0, maximum: 1 },
        summary: { type: "string" },
        riskLevel: { type: "string", enum: ["low", "medium", "high"] },
        recommendation: { type: "string" },
      },
      required: ["overallScore", "summary", "riskLevel", "recommendation"],
      additionalProperties: false,
    },
  },
  required: ["assessment"],
  additionalProperties: false,
};

const pipelineSchema: JSONSchemaType<PipelineResult> = {
  type: "object",
  properties: {
    jobId: { type: "string" },
    retrieval: retrievalSchema,
    matching: matchingSchema,
    findingGeneration: findingGenerationSchema,
    agreementScoring: agreementScoringSchema,
    categorySynthesis: categorySynthesisSchema,
    overallAssessment: overallAssessmentSchema,
  },
  required: [
    "jobId",
    "retrieval",
    "matching",
    "findingGeneration",
    "agreementScoring",
    "categorySynthesis",
    "overallAssessment",
  ],
  additionalProperties: false,
};

const validateJob = ajv.compile(jobSchema);
const validateRetrieval = ajv.compile(retrievalSchema);
const validateMatching = ajv.compile(matchingSchema);
const validateFindingGeneration = ajv.compile(findingGenerationSchema);
const validateAgreementScoring = ajv.compile(agreementScoringSchema);
const validateCategorySynthesis = ajv.compile(categorySynthesisSchema);
const validateOverallAssessment = ajv.compile(overallAssessmentSchema);
const validatePipeline = ajv.compile(pipelineSchema);

const parseJson = (value: string, label: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`${label} response was not valid JSON: ${(error as Error).message}`);
  }
};

const ensureValid = <T>(validator: (data: unknown) => data is T, data: unknown, label: string): T => {
  if (!validator(data)) {
    const errors = validator.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ");
    throw new Error(`${label} failed schema validation: ${errors ?? "unknown error"}`);
  }
  return data;
};

const buildPrompt = (task: string, schema: object, input: object) => {
  const schemaText = JSON.stringify(schema, null, 2);
  return `Task: ${task}\n\nReturn only JSON that matches this schema:\n${schemaText}\n\nInput:\n${JSON.stringify(input)}`;
};

const callFoundry = async (task: string, schema: object, input: object): Promise<unknown> => {
  const body = {
    messages: [
      {
        role: "system",
        content: "You are a reasoning worker. Respond with strict JSON only.",
      },
      {
        role: "user",
        content: buildPrompt(task, schema, input),
      },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  };

  const url = new URL(`openai/deployments/${foundryDeployment}/chat/completions`, foundryEndpoint);
  url.searchParams.set("api-version", foundryApiVersion);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "api-key": foundryApiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Foundry request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Foundry response missing content");
  }

  return parseJson(content, task);
};

const runPipeline = async (job: ReasoningJob): Promise<PipelineResult> => {
  const retrieval = ensureValid(
    validateRetrieval,
    await callFoundry("Retrieval", retrievalSchema, {
      claim: job.claim,
      documents: job.context.documents,
    }),
    "Retrieval",
  );

  const matching = ensureValid(
    validateMatching,
    await callFoundry("Matching", matchingSchema, {
      claim: job.claim,
      criteria: job.criteria,
      retrieval,
    }),
    "Matching",
  );

  const findingGeneration = ensureValid(
    validateFindingGeneration,
    await callFoundry("Finding generation", findingGenerationSchema, {
      claim: job.claim,
      matches: matching.matches,
    }),
    "Finding generation",
  );

  const agreementScoring = ensureValid(
    validateAgreementScoring,
    await callFoundry("Agreement scoring", agreementScoringSchema, {
      claim: job.claim,
      findings: findingGeneration.findings,
    }),
    "Agreement scoring",
  );

  const categorySynthesis = ensureValid(
    validateCategorySynthesis,
    await callFoundry("Category synthesis", categorySynthesisSchema, {
      findings: findingGeneration.findings,
      agreements: agreementScoring.agreements,
    }),
    "Category synthesis",
  );

  const overallAssessment = ensureValid(
    validateOverallAssessment,
    await callFoundry("Overall assessment", overallAssessmentSchema, {
      claim: job.claim,
      findings: findingGeneration.findings,
      agreements: agreementScoring.agreements,
      categories: categorySynthesis.categories,
    }),
    "Overall assessment",
  );

  const pipelineResult: PipelineResult = {
    jobId: job.jobId,
    retrieval,
    matching,
    findingGeneration,
    agreementScoring,
    categorySynthesis,
    overallAssessment,
  };

  return ensureValid(validatePipeline, pipelineResult, "Pipeline result");
};

const decodeJob = (message: ServiceBusReceivedMessage): ReasoningJob => {
  const body = typeof message.body === "string" ? parseJson(message.body, "Job") : message.body;
  return ensureValid(validateJob, body, "Job");
};

const main = async () => {
  console.log("Reasoning worker starting...");
  const client = new ServiceBusClient(serviceBusConnectionString);
  const receiver = client.createReceiver(reasoningQueueName, { receiveMode: "peekLock" });
  const sender = client.createSender(outputQueueName);

  const subscription = receiver.subscribe(
    {
      processMessage: async (message) => {
        const job = decodeJob(message);
        console.log(`Processing job ${job.jobId}`);
        try {
          const result = await runPipeline(job);
          await sender.sendMessages({
            body: {
              jobId: job.jobId,
              completedAt: new Date().toISOString(),
              result,
            },
            contentType: "application/json",
          });
          await receiver.completeMessage(message);
        } catch (error) {
          console.error(`Job ${job.jobId} failed`, error);
          await receiver.deadLetterMessage(message, {
            deadLetterReason: "PipelineFailure",
            deadLetterErrorDescription: (error as Error).message,
          });
        }
      },
      processError: async (args) => {
        console.error("Service Bus processing error", args.error);
      },
    },
    {
      maxConcurrentCalls,
    },
  );

  const shutdown = async () => {
    console.log("Shutting down reasoning worker...");
    await subscription.close();
    await receiver.close();
    await sender.close();
    await client.close();
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
};

void main();
