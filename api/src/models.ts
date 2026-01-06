export type DomainType =
  | "standard"
  | "standardVersion"
  | "criteriaFramework"
  | "category"
  | "criterion"
  | "contextualMemory"
  | "run"
  | "finding"
  | "document"
  | "documentExtraction";

export interface DomainRecord {
  id: string;
  type: DomainType;
  createdAt: string;
  updatedAt: string;
}

export interface Standard extends DomainRecord {
  type: "standard";
  name: string;
  description?: string;
  currentVersionId?: string;
  context: "general" | "recruitment";
  contextSuggestion: "general" | "recruitment";
  contextConfirmed: boolean;
  contextConfirmedAt?: string;
  contextConfirmedBy?: string;
}

export interface StandardVersion extends DomainRecord {
  type: "standardVersion";
  standardId: string;
  version: string;
  description?: string;
  status: "draft" | "active" | "retired";
  frameworkId?: string;
}

export interface CriteriaFramework extends DomainRecord {
  type: "criteriaFramework";
  standardVersionId: string;
  name: string;
  description?: string;
  content?: string;
  revision: number;
}

export interface Category extends DomainRecord {
  type: "category";
  frameworkId: string;
  name: string;
  group: string;
  description?: string;
  order?: number;
}

export type ApprovalStatus = "draft" | "pending" | "approved" | "rejected";

export interface CriterionApproval {
  status: ApprovalStatus;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  reapprovalRequiredAt?: string;
  reapprovalReason?: string;
}

export interface Criterion extends DomainRecord {
  type: "criterion";
  frameworkId: string;
  categoryId: string;
  title: string;
  description?: string;
  contextualMemoryId?: string;
  approval: CriterionApproval;
}

export interface ContextualMemory extends DomainRecord {
  type: "contextualMemory";
  frameworkId: string;
  label?: string;
  content: string;
  revision: number;
}

export interface Run extends DomainRecord {
  type: "run";
  standardVersionId: string;
  frameworkId: string;
  status: "in_progress" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface Finding extends DomainRecord {
  type: "finding";
  findingId: string;
  runId: string;
  criterionId: string;
  version: number;
  status: "open" | "resolved" | "dismissed";
  evidence?: string;
  notes?: string;
}

export interface Document extends DomainRecord {
  type: "document";
  fileName: string;
  contentType?: string;
  sizeBytes: number;
  sha256: string;
  blobUrl: string;
  status: "uploaded" | "extracted" | "failed";
  extractionId?: string;
  extractionVersion?: string;
  fallbackUsed?: boolean;
  extractionError?: string;
}

export interface DocumentExtraction extends DomainRecord {
  type: "documentExtraction";
  hash: string;
  version: string;
  extractedText: string;
  fallbackUsed: boolean;
  source: "document-intelligence" | "llm-vision";
  extractedAt: string;
}

export function nowIso() {
  return new Date().toISOString();
}
