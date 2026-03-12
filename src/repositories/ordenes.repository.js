const supabase = require('../utils/db');

async function insertOrdenes(ordenes) {
  const { error } = await supabase
    .from('ordenes')
    .insert(ordenes);
  if (error) throw new Error(error.message);
}

async function deleteByReporte(reporte_id) {
  const { error } = await supabase
    .from('ordenes')
    .delete()
    .eq('reporte_id', reporte_id);
  if (error) throw new Error(error.message);
}

async function getOrdenes({ status, search, matched, page = 1, limit = 15, reporte_id, supplier }) {
  let query = supabase
    .from('ordenes')
    .select('*', { count: 'exact' });

  if (status && status !== 'all') query = query.eq('status', status);
  if (matched === 'true')  query = query.eq('matched', true);
  if (matched === 'false') query = query.eq('matched', false);
  if (reporte_id) query = query.eq('reporte_id', reporte_id);

  if (supplier) query = query.eq('supplier', supplier);

  if (search) {
    query = query.or(
      `po_id.ilike.%${search}%,supplier.ilike.%${search}%,buyer.ilike.%${search}%,item.ilike.%${search}%,planta.ilike.%${search}%`
    );
  }
  
  const from = (page - 1) * limit;
  query = query
    .range(from, from + limit - 1)
    .order('days_diff', { ascending: true });

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data, count };
}

async function getEstadisticas(reporte_id) {
  let query = supabase
    .from('ordenes')
    .select('status, planta, buyer, supplier, sup_name, matched');
  if (reporte_id) query = query.eq('reporte_id', reporte_id);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

async function getUltimoReporteId() {
  const { data, error } = await supabase
    .from('reportes')
    .select('id')
    .order('creado_en', { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data?.id;
}

module.exports = { insertOrdenes, deleteByReporte, getOrdenes, getEstadisticas, getUltimoReporteId };