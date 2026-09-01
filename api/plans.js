import { supabase } from './_lib/supabase.js';
import { requireAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      const { data, error } = await supabase.from('plans').select('*').eq('id', id).single();
      if (error || !data) return res.status(404).json({ error: 'not found' });
      if (data.user_id !== user.id) return res.status(404).json({ error: 'not found' }); // 남의 자료는 존재 자체를 숨김
      return res.status(200).json(data);
    }
    const { data, error } = await supabase.from('plans').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { title, period_start, period_end, success_criteria, priority, expected_hours } = req.body || {};
    if (!title || !period_start || !period_end) return res.status(400).json({ error: 'title, period_start, period_end는 필수입니다.' });
    const { data, error } = await supabase.from('plans').insert({
      user_id: user.id, title, period_start, period_end, success_criteria, priority, expected_hours,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });
    const { data: existing, error: findErr } = await supabase.from('plans').select('*').eq('id', id).single();
    if (findErr || !existing) return res.status(404).json({ error: 'not found' });
    if (existing.user_id !== user.id) return res.status(403).json({ error: 'forbidden' });

    const { count } = await supabase.from('plan_history').select('*', { count: 'exact', head: true }).eq('plan_id', id);
    await supabase.from('plan_history').insert({ plan_id: id, version: (count || 0) + 1, snapshot: existing });

    const patch = { ...req.body, updated_at: new Date().toISOString() };
    delete patch.id; delete patch.user_id; delete patch.created_at;
    const { data, error } = await supabase.from('plans').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });
    const { data: existing, error: findErr } = await supabase.from('plans').select('user_id').eq('id', id).single();
    if (findErr || !existing) return res.status(404).json({ error: 'not found' });
    if (existing.user_id !== user.id) return res.status(403).json({ error: 'forbidden' });
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
