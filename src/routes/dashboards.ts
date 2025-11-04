import express, { Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth.js';
import { pool } from '../config/database.js';

const router = express.Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM dashboards WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user?.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboards' });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body as { name: string; description: string };
    const result = await pool.query(
      'INSERT INTO dashboards (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [req.user?.id, name, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create dashboard' });
  }
});

export default router;
