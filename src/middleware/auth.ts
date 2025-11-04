import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request to include all needed properties
export interface AuthRequest extends Request {
  user?: { id: number; email: string };
  get?: (header: string) => string | undefined;
  params?: { [key: string]: string };
  body?: { [key: string]: unknown };
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = (req.get as (header: string) => string | undefined)?.(
    'authorization'
  );
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as {
      id: number;
      email: string;
    };
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
