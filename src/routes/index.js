const express = require("express");
const multer = require("multer");
const bodyParser = express.json();
const router = express.Router();
const authorizeCtrl = require("../controllers/authorizeCtrl");
const langCtrl = require("../controllers/langCtrl");
const {
    authMiddleware,
    memberMiddleware,
    jsonMiddleware,
    nextMiddleware,
    mcopMiddleware,
    applyMiddleware
} = require("../middlewares/index");



router.use('/authorize', authMiddleware, authorizeCtrl.index);
router.get('/lang/semrush', langCtrl.semrush);
router.get('/lang/spyfu', langCtrl.spyfu);

router.use(
    '/', 
    multer().any(), 
    memberMiddleware, 
    jsonMiddleware, 
    bodyParser, 
    nextMiddleware, 
    mcopMiddleware,
    applyMiddleware
);

module.exports = router;