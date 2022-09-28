const router = require('express').Router();
const lazadaController = require('../controllers/lazadaController');

router.get('/', lazadaController.refreshToken);
router.post('/orders', lazadaController.addLazadaOrders);

module.exports = router;
