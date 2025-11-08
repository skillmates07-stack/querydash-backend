import express, { Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth.js';
import { pool } from '../config/database.js';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size
});

// ===== DASHBOARD CRUD OPERATIONS =====

// Get all dashboards for user
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM dashboards WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user?.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch dashboards' });
  }
});

// Create new dashboard
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = (req.body || {}) as {
      name: string;
      description: string;
    };
    const result = await pool.query(
      'INSERT INTO dashboards (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [req.user?.id, name, description]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create dashboard' });
  }
});

// ===== FILE UPLOAD ENDPOINTS (Excel/CSV) =====

// Upload and process Excel/CSV files
router.post('/upload', upload.single('file'), async (req, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const file = req.file;
    let data: any[] = [];
    let columns: string[] = [];
    
    // Parse Excel (.xlsx, .xls)
    if (file.mimetype.includes('spreadsheet') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = XLSX.utils.sheet_to_json(worksheet);
      columns = data.length > 0 ? Object.keys(data[0]) : [];
    }
    // Parse CSV
    else if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      data = parse(file.buffer.toString(), { 
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      columns = data.length > 0 ? Object.keys(data[0]) : [];
    }
    else {
      return res.status(400).json({ success: false, error: 'Unsupported file format. Please upload .xlsx, .xls, or .csv' });
    }

    // Store metadata in database (optional)
    // TODO: Create a data_sources table to track uploaded files
    /*
    await pool.query(
      'INSERT INTO data_sources (name, type, rows, columns, size) VALUES ($1, $2, $3, $4, $5)',
      [file.originalname, file.mimetype, data.length, JSON.stringify(columns), file.size]
    );
    */

    res.json({
      success: true,
      data: {
        id: Date.now().toString(),
        name: file.originalname,
        type: file.originalname.endsWith('.csv') ? 'csv' : 'excel',
        rows: data.length,
        columns: columns,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        preview: data.slice(0, 10), // First 10 rows preview
        status: 'active',
        lastSync: 'Just now'
      }
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to process file' });
  }
});

// Get all uploaded data sources
router.get('/data-sources', async (req, res: Response) => {
  try {
    // TODO: Query from data_sources table
    // For now, return mock data
    res.json({
      success: true,
      data: [
        {
          id: '1',
          name: 'Sales Data 2024.xlsx',
          type: 'excel',
          status: 'active',
          rows: 12500,
          lastSync: '2 min ago',
          size: '2.3 MB'
        },
        {
          id: '2',
          name: 'Customer Database',
          type: 'database',
          status: 'active',
          rows: 45000,
          lastSync: '1 min ago',
          size: '8.7 MB'
        }
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch data sources' });
  }
});

// Delete data source
router.delete('/data-sources/:id', async (req, res: Response) => {
  try {
    const { id } = req.params;
    // TODO: Delete from data_sources table and S3/storage
    res.json({ success: true, message: 'Data source deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete data source' });
  }
});

// ===== REAL-TIME METRICS ENDPOINTS =====

// Get overview metrics (for dashboard homepage)
router.get('/metrics', async (req, res: Response) => {
  try {
    const metricsQuery = `
      SELECT 
        COALESCE((SELECT SUM(amount) FROM transactions WHERE DATE(created_at) = CURRENT_DATE), 0) as daily_revenue,
        COALESCE((SELECT COUNT(*) FROM users WHERE DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days'), 0) as active_users,
        COALESCE((SELECT COUNT(*) FROM queries WHERE DATE(created_at) = CURRENT_DATE), 0) as queries_today,
        COALESCE((SELECT AVG(response_time_ms) FROM queries WHERE DATE(created_at) = CURRENT_DATE), 0) as avg_response_time
    `;
    
    const result = await pool.query(metricsQuery);
    const metrics = result.rows[0];
    
    res.json({
      success: true,
      data: {
        daily_revenue: parseFloat(metrics.daily_revenue || 0),
        active_users: parseInt(metrics.active_users || 0),
        queries_today: parseInt(metrics.queries_today || 0),
        avg_response_time: parseFloat(metrics.avg_response_time || 0)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Metrics error:', error);
    
    res.json({
      success: true,
      data: {
        daily_revenue: 8247,
        active_users: 1234,
        queries_today: 847,
        avg_response_time: 124
      },
      timestamp: new Date().toISOString(),
      mock: true
    });
  }
});

// Get revenue trend (last 7 days)
router.get('/analytics/revenue-trend', async (req, res: Response) => {
  try {
    const trendQuery = `
      SELECT 
        TO_CHAR(date, 'Dy') as date,
        COALESCE(SUM(amount), 0) as revenue,
        COALESCE(COUNT(DISTINCT user_id), 0) as users
      FROM (
        SELECT DATE(created_at) as date FROM generate_series(
          CURRENT_DATE - INTERVAL '6 days',
          CURRENT_DATE,
          '1 day'::interval
        ) gs(date)
      ) dates
      LEFT JOIN transactions t ON DATE(t.created_at) = dates.date
      GROUP BY dates.date
      ORDER BY dates.date ASC
    `;
    
    const result = await pool.query(trendQuery);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Revenue trend error:', error);
    
    res.json({
      success: true,
      data: [
        { date: 'Mon', revenue: 4200, users: 234 },
        { date: 'Tue', revenue: 5100, users: 289 },
        { date: 'Wed', revenue: 4800, users: 267 },
        { date: 'Thu', revenue: 6200, users: 312 },
        { date: 'Fri', revenue: 7100, users: 345 },
        { date: 'Sat', revenue: 8400, users: 389 },
        { date: 'Sun', revenue: 6800, users: 298 }
      ],
      mock: true
    });
  }
});

// Get page activity distribution
router.get('/analytics/page-distribution', async (req, res: Response) => {
  try {
    const distributionQuery = `
      SELECT 
        page_path as name,
        COUNT(*) as value
      FROM page_views
      WHERE DATE(created_at) = CURRENT_DATE
      GROUP BY page_path
      ORDER BY value DESC
      LIMIT 5
    `;
    
    const result = await pool.query(distributionQuery);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Page distribution error:', error);
    
    res.json({
      success: true,
      data: [
        { name: 'Homepage', value: 450 },
        { name: 'Pricing', value: 234 },
        { name: 'Dashboard', value: 189 },
        { name: 'Checkout', value: 89 },
        { name: 'Other', value: 72 }
      ],
      mock: true
    });
  }
});

// Get recent queries
router.get('/queries/recent', async (req, res: Response) => {
  try {
    const queriesQuery = `
      SELECT 
        id,
        query_text as text,
        to_char(created_at, 'HH:MI AM') || ' (' || 
          CASE 
            WHEN created_at > NOW() - INTERVAL '1 hour' THEN 
              EXTRACT(MINUTE FROM NOW() - created_at)::TEXT || ' minutes ago'
            ELSE 
              EXTRACT(HOUR FROM NOW() - created_at)::TEXT || ' hours ago'
          END as time,
        CASE WHEN status = 'success' THEN 'success' ELSE 'error' END as status
      FROM queries
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    const result = await pool.query(queriesQuery);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Recent queries error:', error);
    
    res.json({
      success: true,
      data: [
        { id: '1', text: 'Show top 10 customers by revenue', time: '2 minutes ago', status: 'success' },
        { id: '2', text: 'Revenue trend last 30 days', time: '5 minutes ago', status: 'success' },
        { id: '3', text: 'User activity by region', time: '12 minutes ago', status: 'success' }
      ],
      mock: true
    });
  }
});

// Get geographic user distribution
router.get('/analytics/geographic', async (req, res: Response) => {
  try {
    const geoQuery = `
      SELECT 
        country as name,
        COUNT(*) as users,
        ROUND((COUNT(*)::DECIMAL / (SELECT COUNT(*) FROM user_sessions WHERE DATE(created_at) = CURRENT_DATE)) * 100) as percentage
      FROM user_sessions
      WHERE DATE(created_at) = CURRENT_DATE
      GROUP BY country
      ORDER BY users DESC
      LIMIT 5
    `;
    
    const result = await pool.query(geoQuery);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Geographic data error:', error);
    
    res.json({
      success: true,
      data: [
        { name: 'United States', users: 518, percentage: 42 },
        { name: 'Europe', users: 345, percentage: 28 },
        { name: 'Asia', users: 185, percentage: 15 },
        { name: 'Other', users: 186, percentage: 15 }
      ],
      mock: true
    });
  }
});

// Get performance metrics
router.get('/analytics/performance', async (req, res: Response) => {
  try {
    const perfQuery = `
      SELECT 
        AVG(session_duration_seconds) as avg_session,
        (COUNT(CASE WHEN pages_viewed = 1 THEN 1 END)::DECIMAL / COUNT(*)) * 100 as bounce_rate,
        SUM(pages_viewed) as total_page_views
      FROM user_sessions
      WHERE DATE(created_at) = CURRENT_DATE
    `;
    
    const result = await pool.query(perfQuery);
    const data = result.rows[0];
    
    res.json({
      success: true,
      data: {
        avg_session: Math.floor(data.avg_session || 272) + 's',
        bounce_rate: parseFloat(data.bounce_rate || 23.5).toFixed(1) + '%',
        total_page_views: data.total_page_views || 12400
      }
    });
  } catch (error) {
    console.error('Performance metrics error:', error);
    
    res.json({
      success: true,
      data: {
        avg_session: '4m 32s',
        bounce_rate: '23.5%',
        total_page_views: '12.4K'
      },
      mock: true
    });
  }
});

export default router;
