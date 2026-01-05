import { CosmosClient } from "@azure/cosmos";

const DATABASE_ID = process.env.COSMOS_DATABASE ?? "crosscheck";
const CONTAINER_ID = process.env.COSMOS_CONTAINER ?? "domain";

let cachedClient: CosmosClient | null = null;
let initializedContainerPromise: Promise<ReturnType<CosmosClient["database"]>> | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getClient(): CosmosClient {
  if (!cachedClient) {
    const endpoint = requiredEnv("COSMOS_ENDPOINT");
    const key = requiredEnv("COSMOS_KEY");
    cachedClient = new CosmosClient({ endpoint, key });
  }
  return cachedClient;
}

async function ensureContainer() {
  if (!initializedContainerPromise) {
    const client = getClient();
    initializedContainerPromise = client.databases
      .createIfNotExists({ id: DATABASE_ID })
      .then((response) =>
        response.database.containers.createIfNotExists({
          id: CONTAINER_ID,
          partitionKey: {
            kind: "Hash",
            paths: ["/type"],
          },
        }),
      )
      .then((response) => response.database);
  }

  return initializedContainerPromise;
}

export async function getDomainContainer() {
  const database = await ensureContainer();
  return database.container(CONTAINER_ID);
}
