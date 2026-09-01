import { supabase } from './_lib/supabase.js';
import { requireAuth, revokeAllSessionsForUser, clearAuthCookie } from './_lib/auth.js';

async function exportAll(userId) {
  const { data: plans } = await supabase.from('plans').select('*').eq('user_id', userId);
  const planIds = (plans || []).map(p => p.id);
  let todos = [], doLogs = [];
  if (planIds.length) {
    const { data: t } = await supabase.from('todos').select('*').in('plan_id', planIds);
    todos = t || [];
    const todoIds = todos.map(t => t.id);
    if (todoIds.length) {
      const { data: d } = await supabase.from('do_logs').select('*').in('todo_id', todoIds);
      doLogs = d || [];
    }
  }
  const { data: seeSnaps } = await supabase.from('see_snapshots').select('*').in('plan_id', planIds.length ? planIds : ['00000000-0000-0000-0000-000000000000']);
  return { exportedAt: new Date().toISOString(), schemaVersion: 3, plans: plans || [], todos, do_logs: doLogs, see_snapshots: seeSnaps || [] };
}

function validateShape(payload) {
  const errs = [];
  if (typeof payload !== 'object' || payload === null) { errs.push('파일 형식이 올바르지 않습니다.'); return errs; }
  for (const key of ['plans', 'todos', 'do_logs']) if (!Array.isArray(payload[key])) errs.push(`${key} 배열이 없습니다.`);
  return errs;
}

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;
  const action = req.query.action;

  if (req.method === 'GET' && action === 'export') {
    return res.status(200).json(await exportAll(user.id));
  }

  if (req.method === 'POST' && action === 'reset') {
    await supabase.from('plans').delete().eq('user_id', user.id); // cascade로 todos/do_logs/see_snapshots/plan_history 함께 삭제
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST' && action === 'delete-account') {
    await supabase.from('plans').delete().eq('user_id', user.id);
    await revokeAllSessionsForUser(user.id);
    await supabase.from('users').delete().eq('id', user.id);
    res.setHeader('Set-Cookie', clearAuthCookie());
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST' && action === 'import') {
    const payload = req.body;
    const shapeErrs = validateShape(payload);
    if (shapeErrs.length) return res.status(400).json({ error: '가져오기 실패: 문법/필수값 오류', details: shapeErrs });

    const result = { plans: { added: 0, dup: 0, invalid: 0 }, todos: { added: 0, dup: 0, invalid: 0 }, do_logs: { added: 0, dup: 0, invalid: 0 } };
    const { data: myPlans } = await supabase.from('plans').select('id').eq('user_id', user.id);
    const { data: myTodos } = await supabase.from('todos').select('id').in('plan_id', (myPlans||[]).map(p=>p.id).length ? (myPlans||[]).map(p=>p.id) : ['00000000-0000-0000-0000-000000000000']);
    const { data: myDo } = await supabase.from('do_logs').select('id').in('todo_id', (myTodos||[]).map(t=>t.id).length ? (myTodos||[]).map(t=>t.id) : ['00000000-0000-0000-0000-000000000000']);
    const planIds = new Set((myPlans||[]).map(r=>r.id));
    const todoIds = new Set((myTodos||[]).map(r=>r.id));
    const doIds = new Set((myDo||[]).map(r=>r.id));

    for (const p of payload.plans) {
      if (!p.id || !p.title || !p.period_start || !p.period_end) { result.plans.invalid++; continue; }
      if (planIds.has(p.id)) { result.plans.dup++; continue; }
      const { error } = await supabase.from('plans').insert({ ...p, user_id: user.id });
      if (error) { result.plans.invalid++; continue; }
      planIds.add(p.id); result.plans.added++;
    }
    for (const t of payload.todos) {
      if (!t.id || !t.plan_id || !t.title) { result.todos.invalid++; continue; }
      if (todoIds.has(t.id)) { result.todos.dup++; continue; }
      if (!planIds.has(t.plan_id)) { result.todos.invalid++; continue; }
      const { error } = await supabase.from('todos').insert(t);
      if (error) { result.todos.invalid++; continue; }
      todoIds.add(t.id); result.todos.added++;
    }
    for (const d of payload.do_logs) {
      if (!d.id || !d.todo_id || !d.idempotency_key) { result.do_logs.invalid++; continue; }
      if (doIds.has(d.id)) { result.do_logs.dup++; continue; }
      if (!todoIds.has(d.todo_id)) { result.do_logs.invalid++; continue; }
      const { error } = await supabase.from('do_logs').insert(d);
      if (error) { result.do_logs.invalid++; continue; }
      doIds.add(d.id); result.do_logs.added++;
    }
    return res.status(200).json({ ok: true, result });
  }

  return res.status(400).json({ error: '알 수 없는 action입니다.' });
}
