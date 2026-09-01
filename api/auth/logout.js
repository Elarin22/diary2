import { getUserFromRequest, revokeSession, clearAuthCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const user = await getUserFromRequest(req);
  if (user) await revokeSession(user.sessionId); // DB에서 실제로 지움 → 같은 쿠키로 재요청해도 거절됨 (C110, C114)
  res.setHeader('Set-Cookie', clearAuthCookie());
  return res.status(200).json({ ok: true });
}
