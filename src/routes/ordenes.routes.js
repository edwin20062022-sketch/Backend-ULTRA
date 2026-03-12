const router = require('express').Router();
const { listar, estadisticas } = require('../controllers/ordenes.controller');
const auth = require('../middlewares/auth.middleware');

router.get('/',             auth, listar);
router.get('/estadisticas', auth, estadisticas);

module.exports = router;