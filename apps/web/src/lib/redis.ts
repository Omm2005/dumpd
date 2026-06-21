import Redis from "ioredis";

import { env } from "@dumpd/env/server";

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    client.on("error", () => {
      // Silently degrade — Redis is optional
    });
  }
  return client;
}
