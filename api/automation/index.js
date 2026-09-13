import { supabase } from '../_lib/supabase.js';

async function computeSeeSummaryByUser() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

  const { data: todos, error } = await supabase
    .from('todos')
    .select(`
      *,
      plans!inner(user_id)
    `)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  const byUser = {};
  for (const t of todos) {
    const uid = t.plans?.user_id;
    if (!uid) continue;
    if (!byUser[uid]) byUser[uid] = [];
    byUser[uid].push(t);
  }

  const userIds = Object.keys(byUser);

  const { data: users } = await supabase
    .from('users')
    .select('id, email')
    .in('id', userIds);
  const emailOf = (uid) => (users || []).find(u => u.id === uid)?.email || uid;

  const summaries = [];

  for (const uid of userIds) {
    const userTodos = byUser[uid];
    const doneTodos = userTodos.filter(t => t.status === 'done');
    const delayedTodos = userTodos.filter(t => t.status !== 'done' && t.due_date && t.due_date < today);

    const todoIds = userTodos.map(t => t.id);
    let doLogs = [];
    if (todoIds.length) {
      const { data, error: doErr } = await supabase
        .from('do_logs')
        .select('*')
        .in('todo_id', todoIds);
      if (doErr) throw new Error(doErr.message);
      doLogs = data;
    }

    const blockedLogs = doLogs.filter(d => d.blocked_reason && d.blocked_reason.trim() !== '');
    const blockedTodoIds = [...new Set(blockedLogs.map(d => d.todo_id))];

    const expectedSum = userTodos.reduce((s, t) => s + (Number(t.expected_minutes) || 0), 0);
    const actualSum = doLogs.reduce((s, d) => s + (Number(d.actual_minutes) || 0), 0);

    summaries.push({
      user_id: uid,
      email: emailOf(uid),
      review_date: today,
      plan_count: userTodos.length,
      done_count: doneTodos.length,
      delayed_count: delayedTodos.length,
      blocked_count: blockedTodoIds.length,
      expected_minutes_sum: expectedSum,
      actual_minutes_sum: actualSum,
      diff_minutes: actualSum - expectedSum
    });
  }

  return summaries;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const secret = req.headers['x-n8n-secret'];
  if (!secret || secret !== process.env.N8N_AUTOMATION_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { type } = req.query;

  try {
    // ── See 요약 (사용자별) ──
    if (type === 'see') {
      const summaries = await computeSeeSummaryByUser();
      return res.status(200).json({
        checked_at: new Date().toISOString(),
        count: summaries.length,
        summaries
      });
    }

    // ── events 조회 ──
    if (type === 'events') {
      const { data, error } = await supabase
        .from('automation_events')
        .select('*')
        .is('processed_at', null)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) return res.status(500).json({ error: error.message });

      const events = data || [];
      if (events.length > 0) {
        const ids = events.map(e => e.id);
        await supabase.from('automation_events')
          .update({ processed_at: new Date().toISOString() })
          .in('id', ids);
      }

      return res.status(200).json({
        checked_at: new Date().toISOString(),
        count: events.length,
        events
      });
    }

    // ── todos 조회 (기본값) ──
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

    const { data, error } = await supabase
      .from('todos')
      .select(`
        id, title, due_date, priority, status, expected_minutes, plan_id,
        plans!inner(id, title, user_id)
      `)
      .is('deleted_at', null)
      .neq('status', 'done')
      .lte('due_date', today)
      .order('due_date', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const todos = (data || []).map(todo => ({
      id: todo.id,
      title: todo.title,
      due_date: todo.due_date,
      priority: todo.priority,
      status: todo.status,
      expected_minutes: todo.expected_minutes,
      plan_id: todo.plan_id,
      plan_title: todo.plans?.title || '',
      user_id: todo.plans?.user_id || null
    }));

    return res.status(200).json({
      checked_at: new Date().toISOString(),
      today,
      count: todos.length,
      todos
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}