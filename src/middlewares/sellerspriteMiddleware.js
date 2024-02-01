const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const cheerio = require("cheerio");
const { jsonAryUrlEncoded, sellerspriteAuthLogin } = require("../services/utils");
const credentialModel = require("../models/credential");
const FormData = require("form-data");
const fs = require("fs");

const sellerspriteMiddleware = (prefix) => createProxyMiddleware({
    target: `https://www.sellersprite.com`,
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
            if (req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
                return responseBuffer;
            }

            if (
                req.path == "/" ||
                (typeof req.user == "object" && !req.user.isAdmin && (
                    req.path === "/v2/me" ||
                    req.path === "/en/price" ||
                    req.path === "/w/user/logout"
                ))
            ) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/v2/welcome";
                res.statusCode = 301;
                res.setHeader("location", domain + "/v2/welcome");
            }

            if (req.path == "/do-auto-login") {
                try {
                    let { username, password } = await credentialModel.findOne({ "type": "sellersprite" });
                    let result = await sellerspriteAuthLogin(username, password);
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
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://www.sellersprite.com", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://www.sellersprite.com", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let links = $("link");
                links.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://www.sellersprite.com", domain));
                    }
                });
                let forms = $("form");
                forms.each(function () {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("https://www.sellersprite.com", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        href = href.replace("https://www.sellersprite.com", domain);
                        $(this).attr("href", href);
                    }
                    let onclick = $(this).attr("onclick");
                    if (onclick !== undefined) {
                        onclick = onclick.replace('https://www.sellersprite.com', domain);
                        $(this).attr("onclick", onclick);
                    }
                });
                let scripts = $("script");
                scripts.each(function () {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        content = content.replaceAll(/https:\/\/www.sellersprite.com/g, domain);
                        $(this).html(content);
                    } else {
                        src = src.replace('https://www.sellersprite.com', domain);
                        $(this).attr("src", src);
                    }
                });
                $("#header-menu > ul > li:nth-child(1)").remove();
                if (typeof req.user == "object" && !req.user.isAdmin) {
                    if (/\/v2\//.test(req.path)) {
                        $("#sidebar-account ul li:nth-child(6), #sidebar-account ul li:nth-child(7), #sidebar-account ul li:nth-child(8)").remove();
                    } else {
                        $("#sidebar-account ul li:nth-child(5), #sidebar-account ul li:nth-child(6)").remove();
                    }
                }
                if ($(".navbar-nav > li:last-child span.badge").text().trim() == "Guest") {
                    const html = fs.readFileSync(__dirname + "/../views/sellersprite-auth.ejs");
                    return html.toString();
                }
                let content = $.html();
                return content;
            }
            return responseBuffer;
        }
    ),
    prependPath: true,
    secure: false,
    hostRewrite: true,
    headers: {
        referer: "https://www.sellersprite.com",
        origin: "https://www.sellersprite.com"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});

module.exports = sellerspriteMiddleware;