const { getOrdenes, getEstadisticas, getUltimoReporteId } = require('../repositories/ordenes.repository');

async function listar(req, res, next) {
  try {
    const { status, search, matched, page = 1, limit = 15, supplier } = req.query;
    const reporte_id = await getUltimoReporteId();
    const result = await getOrdenes({
      status, search, matched, supplier,
      page: Number(page),
      limit: Number(limit),
      reporte_id,
    });
    res.json({ data: result.data, count: result.count });
  } catch (err) {
    next(err);
  }
}

async function estadisticas(req, res, next) {
  try {
    const reporte_id = await getUltimoReporteId();
    const ordenes = await getEstadisticas(reporte_id);

    const kpis = {
      total:        ordenes.length,
      atrasado:     ordenes.filter(o => o.status === 'atrasado').length,
      expeditacion: ordenes.filter(o => o.status === 'expeditacion').length,
      atiempo:      ordenes.filter(o => o.status === 'atiempo').length,
      con_contacto: ordenes.filter(o => o.matched).length,
      sin_contacto: ordenes.filter(o => !o.matched).length,
    };

    const supCount = {};
    ordenes.filter(o => o.status === 'atrasado').forEach(o => {
      const n = o.sup_name || o.supplier;
      supCount[n] = (supCount[n] || 0) + 1;
    });
    const topSuppliers = Object.entries(supCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    const plantCount = {};
    ordenes.filter(o => o.status === 'atrasado').forEach(o => {
      plantCount[o.planta] = (plantCount[o.planta] || 0) + 1;
    });
    const topPlantas = Object.entries(plantCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    const buyerCount = {};
    ordenes.filter(o => o.status === 'atrasado').forEach(o => {
      buyerCount[o.buyer] = (buyerCount[o.buyer] || 0) + 1;
    });
    const topCompradores = Object.entries(buyerCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    res.json({ kpis, topSuppliers, topPlantas, topCompradores });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, estadisticas };