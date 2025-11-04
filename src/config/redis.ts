import dotenv from 'dotenv';

dotenv.config();

export class RedisClient {
  private enabled: boolean;

  constructor() {
    this.enabled = !!(process.env.REDIS_URL && process.env.REDIS_TOKEN);
    if (!this.enabled) {
      console.warn('⚠️ Redis disabled (not configured)');
    }
  }

  async get(key: string) {
    if (!this.enabled) return null;
    console.log(`Cache GET: ${key}`);
    return null;
  }

  async set(key: string, value: string, exSeconds?: number) {
    if (!this.enabled) return;
    console.log(`Cache SET: ${key}`);
  }

  async del(key: string) {
    if (!this.enabled) return;
    console.log(`Cache DEL: ${key}`);
  }
}

export const redis = new RedisClient();

export async function initializeRedis() {
  console.log('✅ Redis module initialized (disabled mode)');
}
