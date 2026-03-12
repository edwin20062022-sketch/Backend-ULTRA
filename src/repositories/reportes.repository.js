const supabase = require('../utils/db');

async function createReporte({ nombre_archivo, total_ordenes, atrasadas, expeditacion, a_tiempo, cargado_por }) {
  const { data, error } = await supabase
    .from('reportes')
    .insert([{ nombre_archivo, total_ordenes, atrasadas, expeditacion, a_tiempo, cargado_por }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function getUltimoReporte() {
  const { data, error } = await supabase
    .from('reportes')
    .select('*')
    .order('creado_en', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

async function getAllReportes() {
  const { data, error } = await supabase
    .from('reportes')
    .select('*')
    .order('creado_en', { ascending: false });

  if (error) return [];
  return data;
}

module.exports = { createReporte, getUltimoReporte, getAllReportes };