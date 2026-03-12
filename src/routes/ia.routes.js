const router = require('express').Router();
const { redactarCorreo, resumenEjecutivo, analizarComentarios, predecirRiesgo, chat } = require('../controllers/ia.controller');
const auth = require('../middlewares/auth.middleware');

router.post('/redactar-correo',      auth, redactarCorreo);
router.post('/resumen-ejecutivo',    auth, resumenEjecutivo);
router.post('/analizar-comentarios', auth, analizarComentarios);
router.post('/predecir-riesgo',      auth, predecirRiesgo);
router.post('/chat',                 auth, chat);

module.exports = router;