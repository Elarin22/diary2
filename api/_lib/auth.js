import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { supabase } from './supabase.js';

const COOKIE_NAME = 'plando_auth';
const SECRET = process.env.SESSION_SECRET;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7일

// ---------- 비밀번호 ----------
// bcrypt는 해시할 때마다 랜덤 salt를 자동으로 섞기 때문에,
// 같은 비밀번호를 두 계정에 넣어도 저장된 해시값이 서로 달라진다 (T07-C104).
export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}
export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ---------- 쿠키 서명 (세션 id를 그대로 노출하지 않기 위함) ----------
function sign(value) {
  const h = crypto.createHmac('sha256', SECRET).update(value).digest('hex');
  return `${value}.${h}`;
}
function verify(signed) {
  if (!signed) return null;
  const idx = signed.lastIndexOf('.');
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(value).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}
function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').filter(Boolean).map(p => {
      const [k, ...v] = p.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
}

// ---------- 세션 (DB에 실제로 저장 — 로그아웃하면 행을 지워서 진짜로 무효화됨, C114) ----------
export async function createSession(userId) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const { data, error } = await supabase.from('sessions').insert({ user_id: userId, expires_at: expiresAt }).select().single();
  if (error) throw new Error(error.message);
  const cookieValue = sign(data.id);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const cookie = `${COOKIE_NAME}=${encodeURIComponent(cookieValue)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
  return { cookie, sessionId: data.id };
}

export function clearAuthCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

// 요청에서 로그인한 사용자를 알아낸다. 없거나 만료/무효화됐으면 null.
export async function getUserFromRequest(req) {
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_NAME];
  const sessionId = verify(raw);
  if (!sessionId) return null;

  const { data: session } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
  if (!session) return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at) < new Date()) return null;

  const { data: user } = await supabase.from('users').select('id, email').eq('id', session.user_id).single();
  if (!user) return null;
  return { ...user, sessionId };
}

export async function revokeSession(sessionId) {
  await supabase.from('sessions').update({ revoked_at: new Date().toISOString() }).eq('id', sessionId);
}

// 비밀번호를 바꿀 때 그 계정의 모든 세션을 무효화 (이전에 발급된 값이 더 이상 안 통하게, C114)
export async function revokeAllSessionsForUser(userId) {
  await supabase.from('sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId).is('revoked_at', null);
}

export async function requireAuth(req, res) {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return null;
  }
  return user;
}
