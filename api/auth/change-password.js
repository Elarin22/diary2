import { supabase } from '../_lib/supabase.js';
import { requireAuth, verifyPassword, hashPassword, revokeAllSessionsForUser, createSession, clearAuthCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password || new_password.length < 8) {
    return res.status(400).json({ error: '현재 비밀번호와 8자 이상의 새 비밀번호를 입력하세요.' });
  }

  const { data: row } = await supabase.from('users').select('password_hash').eq('id', user.id).single();
  const ok = await verifyPassword(current_password, row.password_hash);
  if (!ok) return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });

  const password_hash = await hashPassword(new_password);
  await supabase.from('users').update({ password_hash }).eq('id', user.id);

  // 비밀번호를 바꾸면 이전에 발급된 모든 세션(이 세션 포함)이 더 이상 통하지 않음 (C114)
  await revokeAllSessionsForUser(user.id);
  const { cookie } = await createSession(user.id); // 새 세션으로 재로그인 처리
  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ ok: true });
}
