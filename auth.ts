import { Request, Response, NextFunction } from 'express';
import { auth } from './firebaseAdmin';

// Augment Express's Request type so `req.uid` is known downstream.
declare global {
  namespace Express {
    interface Request {
      uid?: string;
    }
  }
}

/**
 * Verifies the Firebase ID token sent by the client as `Authorization: Bearer <token>`.
 * The frontend gets this token via `getAuth().currentUser.getIdToken()` after signing in
 * with Firebase Auth (unchanged from today's flow) and attaches it to every request to
 * this backend. Rejects with 401 if missing/invalid/expired.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header. Expected: Bearer <idToken>' });
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (error: any) {
    console.error('Auth verification failed:', error?.message || error);
    return res.status(401).json({ error: 'Invalid or expired auth token' });
  }
}
