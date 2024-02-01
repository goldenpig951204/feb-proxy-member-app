
const base64 = require("base-64");
const {
    genSess,
    decodeSess,
    isValidSess,
    isAccessable
} = require("../services/utils");

const sessionMapper = new Map();

const authMiddleware = async (req, res, next) => {
    let domain = req.headers["host"];

    let userAgent = req.headers["user-agent"];
    let ipAddr = process.env.NODE_ENV == "development" ? "209.127.228.186" : req.headers["x-forwarded-for"];
    let { sess, site } = req.body;
    if (!sess) {
        return res.render('warning', { msg: 'Bad Request, please try again.' });
    }
    if (!isValidSess(sess, userAgent, ipAddr)) {
        return res.render('warning', { msg: 'Session is invalid.' });
    }
    let { dataBuffer, data } = decodeSess(sess);
    let newSess = genSess(dataBuffer, userAgent, ipAddr);
    let user = {
        id: data[0],
        isAdmin: Number(data[3]),
        username: data[1].split("=")[1].split("|")[0],
        accessAble: Number(data[3]) ? true : await isAccessable(data[0], site)
    }
    sessionMapper.set(`${site}-${user.id}`, newSess);
    res.cookie("sess", newSess, {
        path: "/",
        domain: process.env.NODE_ENV === "development" ? undefined : domain
    });
    res.cookie("wpInfo", base64.encode(JSON.stringify({user, site})), {
        path: "/",
        domain: process.env.NODE_ENV === "development" ? undefined : domain
    });
    res.cookie("prefix", "www", {
        path: "/",
        domain: process.env.NODE_ENV === "development" ? undefined : domain
    });    
    next();
}

module.exports = authMiddleware;