const supabase = require('../utils/db');

async function logCorreo({ orden_id, po_id, destinatario_email, destinatario_nombre, asunto, cuerpo, enviado_por, resend_id }) {
  const { data, error } = await supabase
    .from('correos_enviados')
    .insert([{ orden_id, po_id, destinatario_email, destinatario_nombre, asunto, cuerpo, enviado_por, resend_id, estado: 'enviado' }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function getCorreosByOrden(orden_id) {
  const { data, error } = await supabase
    .from('correos_enviados')
    .select('*')
    .eq('orden_id', orden_id)
    .order('enviado_en', { ascending: false });

  if (error) return [];
  return data;
}

async function getAllCorreos({ page = 1, limit = 20 }) {
  const from = (page - 1) * limit;
  const { data, error, count } = await supabase
    .from('correos_enviados')
    .select('*', { count: 'exact' })
    .range(from, from + limit - 1)
    .order('enviado_en', { ascending: false });

  if (error) throw new Error(error.message);
  return { data, count };
}

module.exports = { logCorreo, getCorreosByOrden, getAllCorreos };