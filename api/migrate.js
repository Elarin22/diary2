import { supabase } from './_lib/supabase.js';
import { requireAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  const { data, error } = await supabase.from('plans').update({ user_id: user.id }).is('user_id', null).select('id');
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, claimed: data.length });
}
