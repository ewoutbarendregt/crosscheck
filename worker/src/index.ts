const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? 5000);

async function runOnce(): Promise<void> {
  // Placeholder for async job processing logic.
  console.log("Worker tick", new Date().toISOString());
}

async function main(): Promise<void> {
  console.log("Worker starting...");
  setInterval(() => {
    void runOnce();
  }, pollIntervalMs);
}

void main();
