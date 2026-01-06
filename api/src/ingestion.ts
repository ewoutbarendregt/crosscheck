import { createHash, randomUUID } from "node:crypto";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  AzureKeyCredential,
  DocumentAnalysisClient,
} from "@azure/ai-form-recognizer";
import { type DocumentExtraction, nowIso } from "./models.js";

const DEFAULT_CONTAINER = "documents";
const DEFAULT_DI_MODEL = "prebuilt-layout";
const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

export function computeSha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function buildBlobServiceClient() {
  const connectionString = requiredEnv("AZURE_STORAGE_CONNECTION_STRING");
  return BlobServiceClient.fromConnectionString(connectionString);
}

export async function uploadDocumentBlob(params: {
  data: Buffer;
  fileName: string;
  contentType?: string;
}) {
  const service = buildBlobServiceClient();
  const containerName = process.env.AZURE_STORAGE_CONTAINER ?? DEFAULT_CONTAINER;
  const container = service.getContainerClient(containerName);
  await container.createIfNotExists();

  const blobName = `${randomUUID()}-${params.fileName}`;
  const blob = container.getBlockBlobClient(blobName);
  await blob.uploadData(params.data, {
    blobHTTPHeaders: params.contentType
      ? { blobContentType: params.contentType }
      : undefined,
  });

  return {
    blobUrl: blob.url,
    blobName,
    containerName,
  };
}

function buildDocumentIntelligenceClient() {
  const endpoint = requiredEnv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");
  const key = requiredEnv("AZURE_DOCUMENT_INTELLIGENCE_KEY");
  return new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
}

export function getDocumentIntelligenceVersion() {
  const modelId = process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL ?? DEFAULT_DI_MODEL;
  return {
    modelId,
    version: `document-intelligence:${modelId}`,
  };
}

export async function extractWithDocumentIntelligence(buffer: Buffer) {
  const client = buildDocumentIntelligenceClient();
  const { modelId, version } = getDocumentIntelligenceVersion();
  const poller = await client.beginAnalyzeDocument(modelId, buffer);
  const result = await poller.pollUntilDone();
  const content = result?.content ?? "";

  if (!content.trim()) {
    throw new Error("Document Intelligence extraction returned empty content");
  }

  return {
    version,
    extractedText: content,
    source: "document-intelligence" as const,
  };
}

function getVisionConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return {
    apiKey,
    endpoint: process.env.OPENAI_VISION_ENDPOINT ?? DEFAULT_OPENAI_ENDPOINT,
    model: process.env.OPENAI_VISION_MODEL ?? DEFAULT_OPENAI_MODEL,
  };
}

export function getVisionVersion() {
  const config = getVisionConfig();
  if (!config) {
    return null;
  }
  return `llm-vision:${config.model}`;
}

export async function extractWithVisionFallback(params: {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}) {
  const config = getVisionConfig();
  if (!config) {
    throw new Error("LLM vision fallback is not configured");
  }

  const base64 = params.buffer.toString("base64");
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content:
            "You extract all readable text from documents. Return only the extracted text.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract the text from this document (${params.fileName}).`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${params.contentType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM vision fallback failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("LLM vision fallback returned empty content");
  }

  return {
    version: `llm-vision:${config.model}`,
    extractedText: content,
    source: "llm-vision" as const,
  };
}

export function buildExtractionRecord(params: {
  hash: string;
  version: string;
  extractedText: string;
  fallbackUsed: boolean;
  source: DocumentExtraction["source"];
}) {
  const now = nowIso();
  const extraction: DocumentExtraction = {
    id: randomUUID(),
    type: "documentExtraction",
    hash: params.hash,
    version: params.version,
    extractedText: params.extractedText,
    fallbackUsed: params.fallbackUsed,
    source: params.source,
    extractedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  return extraction;
}
