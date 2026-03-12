const router = require('express').Router();
const { login, registro, me } = require('../controllers/auth.controller');
const auth = require('../middlewares/auth.middleware');

router.post('/login',    login);
router.post('/registro', registro);
router.get('/me',        auth, me);

module.exports = router;