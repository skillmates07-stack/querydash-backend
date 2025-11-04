import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino();

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  // Log error
  logger.error({
    statusCode,
    message,
    path: req.path,
    method: req.method,
    stack: err.stack
  });

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorMessage = isDevelopment ? message : 'Something went wrong';

  res.status(statusCode).json({
    error: {
      message: errorMessage,
      statusCode,
      ...(isDevelopment && { stack: err.stack })
    }
  });
};
