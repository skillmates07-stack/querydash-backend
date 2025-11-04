import dotenv from 'dotenv';

dotenv.config();

// Upstash Redis REST API helper
export class RedisClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = process.env.REDIS_URL || '';
    this.token = process.env.REDIS_TOKEN || '';

    if (!this.baseUrl || !this.token) {
      console.warn('⚠️ Redis not configured. Caching disabled.');
    }
  }

  async get(key: string) {
    if (!this.baseUrl) return null;

    try {
      const response = await fetch(`${this.baseUrl}/get/${key}`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      const data = (await response.json()) as { result: string | null };
      return data.result;
    } catch (error) {
      console.error('Redis GET failed:', error);
      return null;
    }
  }

  async set(key: string, value: string, exSeconds: number = 300) {
    if (!this.baseUrl) return;

    try {
      await fetch(`${this.baseUrl}/set/${key}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ value, ex: exSeconds })
      });
    } catch (error) {
      console.error('Redis SET failed:', error);
    }
  }

  async del(key: string) {
    if (!this.baseUrl) return;

    try {
      await fetch(`${this.baseUrl}/del/${key}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.token}` }
      });
    } catch (error) {
      console.error('Redis DEL failed:', error);
    }
  }
}

export const redis = new RedisClient();

export async function initializeRedis() {
  try {
    if (process.env.REDIS_URL) {
      console.log('✅ Redis configured');
    }
  } catch (error) {
    console.error('❌ Redis initialization failed:', error);
  }
}
