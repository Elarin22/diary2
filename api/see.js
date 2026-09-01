import { supabase } from './_lib/supabase.js';
import { requireAuth } from './_lib/auth.js';

function todayKST() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

async function computeAggregate(planId, reviewDate) {
  const { data: todos, error } = await supabase.from('todos').select('*').eq('plan_id', planId).is('deleted_at', null);
  if (error) throw new Error(error.message);

  const planTodos = todos;
  const doneTodos = todos.filter(t => t.status === 'done');
  const delayedTodos = todos.filter(t => t.status !== 'done' && t.due_date && t.due_date < reviewDate);

  const todoIds = todos.map(t => t.id);
  let doLogs = [];
  if (todoIds.length) {
    const { data, error: doErr } = await supabase.from('do_logs').select('*').in('todo_id', todoIds);
    if (doErr) throw new Error(doErr.message);
    doLogs = data;
  }
  const blockedLogs = doLogs.filter(d => d.blocked_reason && d.blocked_reason.trim() !== '');
  const blockedTodoIds = [...new Set(blockedLogs.map(d => d.todo_id))];

  const expectedSum = todos.reduce((s, t) => s + (Number(t.expected_minutes) || 0), 0);
  const actualSum = doLogs.reduce((s, d) => s + (Number(d.actual_minutes) || 0), 0);
  const titleOf = id => (todos.find(t => t.id === id) || {}).title || '(삭제됨)';

  return {
    plan_id: planId, review_date: reviewDate,
    plan_count: planTodos.length, done_count: doneTodos.length,
    delayed_count: delayedTodos.length, blocked_count: blockedTodoIds.length,
    expected_minutes_sum: expectedSum, actual_minutes_sum: actualSum, diff_minutes: actualSum - expectedSum,
    evidence: {
      plan_count: planTodos.map(t => ({ id: t.id, title: t.title })),
      done_count: doneTodos.map(t => ({ id: t.id, title: t.title })),
      delayed_count: delayedTodos.map(t => ({ id: t.id, title: t.title, due_date: t.due_date })),
      blocked_count: blockedTodoIds.map(id => ({ id, title: titleOf(id) })),
      expected_minutes_sum: todos.map(t => ({ id: t.id, title: t.title, expected_minutes: t.expected_minutes })),
      actual_minutes_sum: doLogs.map(d => ({ id: d.id, todo_id: d.todo_id, title: titleOf(d.todo_id), actual_minutes: d.actual_minutes, started_at: d.started_at, ended_at: d.ended_at })),
    },
  };
}

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { plan_id, review_date } = req.query;
    if (!plan_id) return res.status(400).json({ error: 'plan_id 쿼리 파라미터가 필요합니다.' });
    const { data: plan } = await supabase.from('plans').select('user_id').eq('id', plan_id).single();
    if (!plan || plan.user_id !== user.id) return res.status(404).json({ error: 'not found' });
    try {
      return res.status(200).json(await computeAggregate(plan_id, review_date || todayKST()));
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'POST') {
    const { plan_id, period_start, period_end, next_plan_note, review_date } = req.body || {};
    if (!plan_id || !period_start || !period_end) return res.status(400).json({ error: 'plan_id, period_start, period_end는 필수입니다.' });
    const { data: plan } = await supabase.from('plans').select('user_id').eq('id', plan_id).single();
    if (!plan) return res.status(404).json({ error: 'not found' });
    if (plan.user_id !== user.id) return res.status(403).json({ error: 'forbidden' });

    let aggregate;
    try { aggregate = await computeAggregate(plan_id, review_date || todayKST()); }
    catch (e) { return res.status(500).json({ error: e.message }); }

    const { data, error } = await supabase.from('see_snapshots').insert({ plan_id, period_start, period_end, aggregate, next_plan_note: next_plan_note || null }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  return res.status(405).json({ error: 'method not allowed' });
}
