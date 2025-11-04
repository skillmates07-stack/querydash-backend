import crypto from 'crypto';

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate CSRF token (simplified - no timingSafeEqual)
 */
export function validateCSRFToken(token: string, sessionToken: string): boolean {
  return token === sessionToken;
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .trim()
    .substring(0, 500);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

/**
 * Check password strength
 */
export function isStrongPassword(password: string): {
  isStrong: boolean;
  message: string;
} {
  if (password.length < 12) {
    return { isStrong: false, message: 'Password must be at least 12 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isStrong: false, message: 'Password must include uppercase letters' };
  }
  if (!/[a-z]/.test(password)) {
    return { isStrong: false, message: 'Password must include lowercase letters' };
  }
  if (!/[0-9]/.test(password)) {
    return { isStrong: false, message: 'Password must include numbers' };
  }
  if (!/[!@#$%^&*]/.test(password)) {
    return { isStrong: false, message: 'Password must include special characters' };
  }
  return { isStrong: true, message: 'Password is strong' };
}

/**
 * SQL injection prevention
 */
export function validateSQLQuery(query: string): boolean {
  const dangerousPatterns = [
    /DELETE\s+FROM/i,
    /DROP\s+TABLE/i,
    /ALTER\s+TABLE/i,
    /UPDATE\s+\w+\s+SET/i,
    /INSERT\s+INTO/i,
    /TRUNCATE/i
  ];

  return !dangerousPatterns.some(pattern => pattern.test(query));
}
