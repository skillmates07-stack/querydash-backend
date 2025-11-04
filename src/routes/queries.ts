import express, { Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth.js';
import { pool } from '../config/database.js';
import { redis } from '../config/redis.js';

const router = express.Router();

router.post(
  '/:dashboardId/execute',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { dashboardId } = req.params;
      const { naturalLanguage } = req.body as { naturalLanguage: string };

      if (!naturalLanguage) {
        return res.status(400).json({ error: 'Natural language query required' });
      }

      const cacheKey = `query:${dashboardId}:${naturalLanguage}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ data: JSON.parse(cached), fromCache: true });
      }

      const result = {
        columns: ['id', 'name', 'value'],
        rows: [
          { id: 1, name: 'Sample Data', value: 100 },
          { id: 2, name: 'Sample Data 2', value: 200 }
        ]
      };

      await redis.set(cacheKey, JSON.stringify(result), 5);

      await pool.query(
        'INSERT INTO queries (dashboard_id, natural_language, result) VALUES ($1, $2, $3)',
        [dashboardId, naturalLanguage, JSON.stringify(result)]
      );

      res.json({ data: result, fromCache: false });
    } catch (error) {
      console.error('Query execution failed:', error);
      res.status(500).json({ error: 'Query execution failed' });
    }
  }
);

export default router;
