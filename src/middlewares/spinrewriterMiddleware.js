const fs = require("fs");
const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const cheerio = require("cheerio");
const { jsonAryUrlEncoded, spinrewriterAuthLogin } = require("../services/utils");
const FormData = require("form-data");
const credentialModel = require("../models/credential");

const spinrewriterMiddleware = (prefix) => createProxyMiddleware({
    target: `https://www.spinrewriter.com`,
    selfHandleResponse: true,
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        let userAgent = req.headers["user-agent"];
        let { cookie } = req.proxy;
        proxyReq.setHeader("user-agent", userAgent);
        proxyReq.setHeader("Cookie", cookie);
        if (req.headers['x-csrf-token']) {
            proxyReq.setHeader('x-csrf-token', req.headers['x-csrf-token']);
        }

        if (["POST", "PATCH", "PUT"].includes(req.method)) {
            let contentType = proxyReq.getHeader("content-type");
            const writeBody = (bodyData) => {
                proxyReq.setHeader("content-length", Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }

            if (contentType && contentType.includes("application/json")) {
                writeBody(JSON.stringify(req.body));
            }

            if (contentType && contentType.includes("application/x-www-form-urlencoded")) {
                let body = jsonAryUrlEncoded(req.body);
                proxyReq.setHeader("content-type", "application/x-www-form-urlencoded");
                writeBody(body);
            }

            if (contentType && contentType.includes("multipart/form-data")) {
                const parts = (req.headers['content-type'] + '').split(/boundary=/);
                const boundary = parts[1];

                const form = new FormData();
                form.setBoundary(boundary);
                for (let name in req.body) {
                    form.append(name, req.body[name]);
                }
                for (let file of req.files) {
                    form.append(file["fieldname"], file.buffer, { filename: file["originalname"] });
                }
                let body = form.getBuffer();
                proxyReq.setHeader("content-type", req.headers["content-type"]);
                writeBody(body);
            }
        }
    },
    onProxyRes: responseInterceptor(
        async (responseBuffer, proxyRes, req, res) => {
            let domain = `https://${req.headers["host"]}`;
            if (req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/) || /^\/ajax/.test(req.path) || /\/dir\/countkeywords/.test(req.path)) {
                return responseBuffer;
            }

            if (req.path == "/" || ((typeof req.user == "object" && !req.user.isAdmin) && (
                /\/cp-api/.test(req.path) ||
                /\/cp-account/.test(req.path) ||
                /\/cp-account-settings/.test(req.path)
            ))) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/cp-home";
                res.statusCode = 301;
                res.setHeader("location", domain + "/cp-home");
            }

            if (req.path == "/do-auto-login") {
                try {
                    let { username, password } = await credentialModel.findOne({ "type": "spinrewriter" });
                    let result = await spinrewriterAuthLogin(username, password);
                    if (result) {
                        res.statusCode = 200;
                        return JSON.stringify({ status: true });
                    } else {
                        res.statusCode = 200;
                        return JSON.stringify({ status: false });
                    }
                } catch (err) {
                    res.statusCode = 200;
                    return JSON.stringify({ status: false });
                }
            }

            if (proxyRes.headers["location"]) {
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://www.spinrewriter.com", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://www.spinrewriter.com", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html") && !req.path.includes("ajax")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let links = $("link");
                links.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://www.spinrewriter.com", domain));
                    }
                });
                let forms = $("form");
                forms.each(function () {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("https://www.spinrewriter.com", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://www.spinrewriter.com", domain));
                    }
                });
                let scripts = $("script");
                scripts.each(function () {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        content = content.replace(/https:\/\/www.spinrewriter.com/g, domain);
                        $(this).html(content);
                    } else {
                        $(this).attr("src", src.replace("https://www.spinrewriter.com", domain));
                    }
                });
                $("#base_path").val(domain + "/");

                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $(".cp-user-navigation > li:nth-child(1), .cp-user-navigation > li:nth-child(2), .cp-user-navigation > li:nth-child(3), .cp-user-navigation > li:nth-child(4), .cp-user-navigation > li:nth-child(5)").remove();
                    $(".cp-navigation > li:nth-child(7)").remove();
                }

                if (/\/log-in/.test(req.path)) {
                    let html = fs.readFileSync(__dirname + "/../views/spinrewriter-auth.ejs");
                    return html.toString();
                }
                return $.html();
            }
            return responseBuffer;
        }
    ),
    prependPath: true,
    secure: false,
    hostRewrite: true,
    headers: {
        referer: "https://www.spinrewriter.com",
        origin: "https://www.spinrewriter.com"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});

module.exports = spinrewriterMiddleware;