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
    const { data, error } = await supabase
      .from('automation_events')
      .select('*')
      .is('processed_at', null)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      return res.status(500).json({
        error: error.message
      });
    }

    const events = data || [];

    // n8n이 조회한 이벤트는 즉시 processed_at을 채워서 다음 폴링에서 중복으로 안 잡히게 함
    if (events.length > 0) {
      const ids = events.map(e => e.id);
      await supabase
        .from('automation_events')
        .update({ processed_at: new Date().toISOString() })
        .in('id', ids);
    }

    return res.status(200).json({
      checked_at: new Date().toISOString(),
      count: events.length,
      events
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}