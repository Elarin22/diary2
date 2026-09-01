import { getUserFromRequest } from '../_lib/auth.js';

export default async function handler(req, res) {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ user: null });
  return res.status(200).json({ user: { id: user.id, email: user.email } });
}
