import { supabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'method not allowed'
    });
  }

  const secret = req.headers['x-n8n-secret'];

  if (!secret || secret !== process.env.N8N_AUTOMATION_SECRET) {
    return res.status(401).json({
      error: 'unauthorized'
    });
  }

  try {
    const today = new Date().toLocaleDateString('sv-SE', {
      timeZone: 'Asia/Seoul'
    });

    const { data, error } = await supabase
      .from('todos')
      .select(`
        id,
        title,
        due_date,
        priority,
        status,
        expected_minutes,
        plan_id,
        plans!inner(
          id,
          title,
          user_id
        )
      `)
      .is('deleted_at', null)
      .neq('status', 'done')
      .lte('due_date', today)
      .order('due_date', { ascending: true });

    if (error) {
      return res.status(500).json({
        error: error.message
      });
    }

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
    return res.status(500).json({
      error: error.message
    });
  }
}
