
const base64 = require("base-64");
const { isValidSess } = require("../services/utils");

const sessionMapper = new Map();

const memberMiddleware = (req, res, next) => {
    if (req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) return next();

    let { wpInfo, sess } = req.cookies;
    if (!wpInfo || !sess) return res.render('warning', { msg: 'Access Denined.' });
    
    let userAgent = req.headers['user-agent'];
    let ipAddr = process.env.NODE_ENV == 'development' ? "209.127.228.186" : req.headers['x-forwarded-for'];
    if (!isValidSess(sess, userAgent, ipAddr)) return res.render("warning", { msg: "Session is invalid!"});
    let wpInfoDecoded = JSON.parse(base64.decode(wpInfo));
    if (!wpInfoDecoded.user.accessAble) return res.render("warning", { msg: "Membership required!"})
    if (!sessionMapper.get(`${wpInfoDecoded.site}-${wpInfoDecoded.user.id}`)) sessionMapper.set(`${wpInfoDecoded.site}-${wpInfoDecoded.user.id}`, sess);
    req.user = wpInfoDecoded.user;
    req.wpSite = wpInfoDecoded.site;
    next();
}

module.exports = memberMiddleware;