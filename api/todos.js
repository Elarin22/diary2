import { supabase } from './_lib/supabase.js';
import { requireAuth } from './_lib/auth.js';

const SORTABLE = ['due_date', 'priority', 'created_at', 'title'];

async function ownsPlan(planId, userId) {
  const { data } = await supabase.from('plans').select('user_id').eq('id', planId).single();
  return !!data && data.user_id === userId;
}

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { id, plan_id, status, tag, q, sort, order } = req.query;

    if (id) {
      const { data, error } = await supabase.from('todos').select('*, plans!inner(user_id)').eq('id', id).single();
      if (error || !data) return res.status(404).json({ error: 'not found' });
      if (data.plans.user_id !== user.id) return res.status(404).json({ error: 'not found' });
      delete data.plans;
      return res.status(200).json(data);
    }

    if (!plan_id) return res.status(400).json({ error: 'plan_id 쿼리 파라미터가 필요합니다.' });
    if (!(await ownsPlan(plan_id, user.id))) return res.status(404).json({ error: 'not found' });

    let query = supabase.from('todos').select('*').eq('plan_id', plan_id).is('deleted_at', null);
    if (status) query = query.eq('status', status);
    if (tag) query = query.contains('tags', [tag]);
    if (q) query = query.ilike('title', `%${q}%`);
    const sortField = SORTABLE.includes(sort) ? sort : 'created_at';
    query = query.order(sortField, { ascending: order !== 'desc' });

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { plan_id, title, due_date, priority, tags, expected_minutes } = req.body || {};
    if (!plan_id || !title) return res.status(400).json({ error: 'plan_id, title은 필수입니다.' });
    if (!(await ownsPlan(plan_id, user.id))) return res.status(403).json({ error: 'forbidden' });
    const { data, error } = await supabase.from('todos').insert({
      plan_id, title, due_date, priority, tags: tags || [], expected_minutes,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });
    const { data: existing } = await supabase.from('todos').select('*, plans!inner(user_id)').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.plans.user_id !== user.id) return res.status(403).json({ error: 'forbidden' });

    const patch = { ...req.body, updated_at: new Date().toISOString() };
    delete patch.id; delete patch.plan_id; delete patch.created_at;
    const { data, error } = await supabase.from('todos').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id 쿼리 파라미터가 필요합니다.' });
    const { data: existing } = await supabase.from('todos').select('*, plans!inner(user_id)').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.plans.user_id !== user.id) return res.status(403).json({ error: 'forbidden' });
    const { error } = await supabase.from('todos').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
