import type { ServiceBusSender } from "@azure/service-bus";
import type { TelemetryClient } from "./telemetry.js";

export interface ReasoningJob {
  jobId: string;
  tenantId: string;
  claim: string;
  context: {
    documents: Array<{ id: string; content: string }>;
  };
  criteria: Array<{ id: string; description: string }>;
}

export interface QueueUsageSnapshot {
  queueDepth: number;
  maxQueueDepth: number;
  tenants: Array<{
    tenantId: string;
    queued: number;
    active: number;
    quota: number;
  }>;
}

interface TenantUsage {
  queued: number;
  active: number;
}

interface QueueItem {
  job: ReasoningJob;
  tenantId: string;
  enqueuedAt: number;
}

export class TenantQuotaError extends Error {
  readonly code = "TenantQuotaExceeded";
  constructor(
    message: string,
    readonly tenantId: string,
    readonly quota: number,
    readonly usage: TenantUsage,
  ) {
    super(message);
  }
}

export class QueueDepthError extends Error {
  readonly code = "QueueDepthExceeded";
  constructor(message: string, readonly queueDepth: number, readonly limit: number) {
    super(message);
  }
}

export class ReasoningQueue {
  private readonly pending: QueueItem[] = [];
  private readonly usageByTenant = new Map<string, TenantUsage>();
  private draining = false;
  private inFlightDispatch = 0;
  private totalQueued = 0;
  private totalActive = 0;

  constructor(
    private readonly sender: ServiceBusSender,
    private readonly options: {
      maxQueueDepth: number;
      maxDispatchInFlight: number;
      defaultTenantQuota: number;
      tenantQuotas: Record<string, number>;
    },
    private readonly telemetry: TelemetryClient,
  ) {}

  enqueue(job: ReasoningJob) {
    const tenantId = job.tenantId;
    const usage = this.getUsage(tenantId);
    const quota = this.getQuota(tenantId);
    const totalUsage = usage.queued + usage.active;
    const totalDepth = this.totalQueued + this.totalActive;

    if (totalDepth >= this.options.maxQueueDepth) {
      throw new QueueDepthError(
        `Queue depth ${totalDepth} exceeds limit ${this.options.maxQueueDepth}.`,
        totalDepth,
        this.options.maxQueueDepth,
      );
    }

    if (totalUsage >= quota) {
      throw new TenantQuotaError(
        `Tenant ${tenantId} exceeded quota of ${quota} jobs.`,
        tenantId,
        quota,
        usage,
      );
    }

    this.pending.push({ job, tenantId, enqueuedAt: Date.now() });
    usage.queued += 1;
    this.totalQueued += 1;

    this.trackMetric("reasoning.queue.depth", this.totalQueued + this.totalActive);
    this.trackEvent("reasoning.queue.enqueued", {
      tenantId,
      jobId: job.jobId,
      queued: usage.queued.toString(),
      active: usage.active.toString(),
      quota: quota.toString(),
    });

    void this.drain();

    return {
      queueDepth: this.totalQueued + this.totalActive,
      position: this.pending.length,
      quota,
      usage: { queued: usage.queued, active: usage.active },
    };
  }

  recordUsageEvent(event: {
    tenantId: string;
    type: "started" | "completed" | "failed" | "rejected";
  }) {
    const usage = this.getUsage(event.tenantId);
    if (event.type === "completed" || event.type === "failed" || event.type === "rejected") {
      if (usage.active > 0) {
        usage.active -= 1;
        this.totalActive = Math.max(0, this.totalActive - 1);
      }
    }

    this.trackEvent("reasoning.queue.event", {
      tenantId: event.tenantId,
      eventType: event.type,
      queued: usage.queued.toString(),
      active: usage.active.toString(),
    });
  }

  getUsageSnapshot(): QueueUsageSnapshot {
    const tenants = Array.from(this.usageByTenant.entries()).map(([tenantId, usage]) => ({
      tenantId,
      queued: usage.queued,
      active: usage.active,
      quota: this.getQuota(tenantId),
    }));

    tenants.sort((a, b) => a.tenantId.localeCompare(b.tenantId));

    return {
      queueDepth: this.totalQueued + this.totalActive,
      maxQueueDepth: this.options.maxQueueDepth,
      tenants,
    };
  }

  private async drain() {
    if (this.draining) {
      return;
    }

    this.draining = true;
    try {
      while (
        this.pending.length > 0 &&
        this.inFlightDispatch < this.options.maxDispatchInFlight
      ) {
        const next = this.pending.shift();
        if (!next) {
          break;
        }
        this.inFlightDispatch += 1;
        this.totalQueued = Math.max(0, this.totalQueued - 1);

        const usage = this.getUsage(next.tenantId);
        if (usage.queued > 0) {
          usage.queued -= 1;
        }
        usage.active += 1;
        this.totalActive += 1;

        try {
          await this.sender.sendMessages({
            body: next.job,
            contentType: "application/json",
            applicationProperties: {
              tenantId: next.tenantId,
            },
          });

          this.trackEvent("reasoning.queue.dispatched", {
            tenantId: next.tenantId,
            jobId: next.job.jobId,
          });
        } catch (error) {
          this.trackException(error, { stage: "dispatch", tenantId: next.tenantId });
          usage.active = Math.max(0, usage.active - 1);
          this.totalActive = Math.max(0, this.totalActive - 1);
          usage.queued += 1;
          this.totalQueued += 1;
          this.pending.unshift(next);
          break;
        } finally {
          this.inFlightDispatch = Math.max(0, this.inFlightDispatch - 1);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private getQuota(tenantId: string) {
    return this.options.tenantQuotas[tenantId] ?? this.options.defaultTenantQuota;
  }

  private getUsage(tenantId: string) {
    const existing = this.usageByTenant.get(tenantId);
    if (existing) {
      return existing;
    }
    const usage = { queued: 0, active: 0 };
    this.usageByTenant.set(tenantId, usage);
    return usage;
  }

  private trackMetric(name: string, value: number) {
    if (!this.telemetry) {
      return;
    }
    this.telemetry.trackMetric({ name, value });
  }

  private trackEvent(name: string, properties: Record<string, string>) {
    if (!this.telemetry) {
      return;
    }
    this.telemetry.trackEvent({ name, properties });
  }

  private trackException(error: unknown, properties?: Record<string, string>) {
    if (!this.telemetry) {
      return;
    }
    this.telemetry.trackException({
      exception: error instanceof Error ? error : new Error(String(error)),
      properties,
    });
  }
}

export function parseTenantQuotas(value?: string) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as Record<string, number>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, quota]) => typeof quota === "number" && quota > 0),
    );
  } catch (error) {
    console.warn("Failed to parse TENANT_HARD_QUOTAS_JSON", error);
    return {};
  }
}
