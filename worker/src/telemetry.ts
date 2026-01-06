import appInsights from "applicationinsights";

export type TelemetryClient = appInsights.TelemetryClient | null;

let client: TelemetryClient | undefined;

export function getTelemetryClient(): TelemetryClient {
  if (client !== undefined) {
    return client;
  }

  const connectionString = process.env.APPINSIGHTS_CONNECTION_STRING;
  if (!connectionString) {
    client = null;
    return client;
  }

  appInsights
    .setup(connectionString)
    .setAutoCollectDependencies(true)
    .setAutoCollectRequests(false)
    .setAutoCollectPerformance(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectConsole(false)
    .setAutoCollectHeartbeat(false)
    .setAutoCollectPreAggregatedMetrics(true)
    .setSendLiveMetrics(false)
    .start();

  client = appInsights.defaultClient;
  return client;
}
