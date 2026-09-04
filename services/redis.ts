import { createClient } from "redis";
import config from "./config";

const client = createClient({
  socket: {
    host: config.redisHost,
    port: config.redisPort,
  },
});

client.on("error", (err: unknown) => {
  console.error("Redis Client Error", err);
});

client.connect().catch((err: unknown) => {
  console.error("Failed to connect to Redis", err);
});

export class Cache {
  static async insert(key: string): Promise<void> {
    await client.set(key, "");
    await client.expire(key, 15);
  }

  static async remove(key: string): Promise<boolean> {
    const resp = await client.del(key);
    return resp > 0;
  }
}

export default Cache;
