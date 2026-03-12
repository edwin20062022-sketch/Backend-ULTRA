const router = require('express').Router();
const multer = require('multer');
const { uploadArchivos } = require('../controllers/upload.controller');
const auth = require('../middlewares/auth.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post(
  '/',
  auth,
  upload.fields([
    { name: 'coupa',     maxCount: 1 },
    { name: 'suppliers', maxCount: 1 },
  ]),
  uploadArchivos
);

module.exports = router;