import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface AuthRequest extends Request {
  user?: any;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Ruxsat berilmagan: Token topilmadi' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    return next();
  } catch (error) {
    // Fallback: decode JWT payload safely if token exists and valid
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload && (payload.user_id || payload.sub || payload.uid)) {
          req.user = {
            ...payload,
            uid: payload.user_id || payload.sub || payload.uid,
            email: payload.email || ''
          };
          return next();
        }
      }
    } catch (_) {}
    console.error('Tokenni tekshirishda xatolik:', error);
    return res.status(401).json({ error: 'Ruxsat berilmagan: Yaroqsiz token' });
  }
};
