import { supabase } from '../_lib/supabase.js';
import { verifyPassword, createSession } from '../_lib/auth.js';

const GENERIC_ERROR = '이메일 또는 비밀번호가 올바르지 않습니다.';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: GENERIC_ERROR });

  const normalizedEmail = String(email).trim().toLowerCase();
  const { data: user } = await supabase.from('users').select('*').eq('email', normalizedEmail).single();

  // 아이디가 없을 때와 비밀번호가 틀렸을 때 응답 문구를 동일하게 유지 (C99)
  if (!user) return res.status(401).json({ error: GENERIC_ERROR });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: GENERIC_ERROR });

  const { cookie } = await createSession(user.id);
  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ user: { id: user.id, email: user.email } });
}
