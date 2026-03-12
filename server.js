require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middlewares ──
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ── Rutas ──
app.use('/api/auth',    require('./src/routes/auth.routes'));
app.use('/api/upload',  require('./src/routes/upload.routes'));
app.use('/api/ordenes', require('./src/routes/ordenes.routes'));
app.use('/api/correos', require('./src/routes/correos.routes'));
app.use('/api/ia',      require('./src/routes/ia.routes'));

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error handler global ──
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`✅ GCC Backend corriendo en http://localhost:${PORT}`);
});