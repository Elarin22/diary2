import { supabase } from '../_lib/supabase.js';
import { hashPassword, createSession } from '../_lib/auth.js';

function validEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const { email, password } = req.body || {};
  if (!email || !validEmail(email)) return res.status(400).json({ error: '올바른 이메일을 입력하세요.' });
  if (!password || password.length < 8) return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });

  const normalizedEmail = String(email).trim().toLowerCase();
  const password_hash = await hashPassword(password);

  const { data: user, error } = await supabase.from('users').insert({ email: normalizedEmail, password_hash }).select('id, email').single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: '이미 가입된 이메일입니다.' }); // C98
    return res.status(500).json({ error: error.message });
  }

  const { cookie } = await createSession(user.id);
  res.setHeader('Set-Cookie', cookie);
  return res.status(201).json({ user });
}
