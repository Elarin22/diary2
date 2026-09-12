import { supabase } from '../_lib/supabase.js';
import { verifyPassword, createSession } from '../_lib/auth.js';

const GENERIC_ERROR = '이메일 또는 비밀번호가 올바르지 않습니다.';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: GENERIC_ERROR });

  const normalizedEmail = String(email).trim().toLowerCase();
  const { data: user } = await supabase.from('users').select('*').eq('email', normalizedEmail).single();

  if (!user) return res.status(401).json({ error: GENERIC_ERROR });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: GENERIC_ERROR });

  const { cookie } = await createSession(user.id);
  res.setHeader('Set-Cookie', cookie);

  // 로그인 성공 이벤트 기록 (실패해도 로그인 자체는 정상 처리)
  supabase.from('automation_events').insert({
    event_type: 'login_success',
    user_id: user.id,
    email: user.email,
    created_at: new Date().toISOString()
  }).then(() => {}, () => {});

  return res.status(200).json({ user: { id: user.id, email: user.email } });
}