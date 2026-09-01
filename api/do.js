import { supabase } from './_lib/supabase.js';
import { requireAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { todo_id, started_at, ended_at, actual_minutes, blocked_reason, idempotency_key } = req.body || {};
  if (!todo_id || !started_at || !ended_at || actual_minutes == null || !idempotency_key) {
    return res.status(400).json({ error: 'todo_id, started_at, ended_at, actual_minutes, idempotency_key는 필수입니다.' });
  }

  const { data: todo } = await supabase.from('todos').select('*, plans!inner(user_id)').eq('id', todo_id).single();
  if (!todo) return res.status(400).json({ error: '존재하지 않는 todo_id입니다.' });
  if (todo.plans.user_id !== user.id) return res.status(403).json({ error: 'forbidden' });

  const { data: already } = await supabase.from('do_logs').select('*').eq('idempotency_key', idempotency_key).maybeSingle();
  if (already) return res.status(200).json({ do_log: already, duplicate: true });

  const { data: doLog, error: insertErr } = await supabase.from('do_logs').insert({
    todo_id, started_at, ended_at, actual_minutes, blocked_reason: blocked_reason || null, idempotency_key,
  }).select().single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const { data: raced } = await supabase.from('do_logs').select('*').eq('idempotency_key', idempotency_key).single();
      return res.status(200).json({ do_log: raced, duplicate: true });
    }
    return res.status(500).json({ error: insertErr.message });
  }

  await supabase.from('todos').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', todo_id);
  return res.status(201).json({ do_log: doLog, duplicate: false });
}
