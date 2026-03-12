const router = require('express').Router();
const { enviar, historial } = require('../controllers/correos.controller');
const auth = require('../middlewares/auth.middleware');

router.post('/enviar',  auth, enviar);
router.get('/historial', auth, historial);

module.exports = router;