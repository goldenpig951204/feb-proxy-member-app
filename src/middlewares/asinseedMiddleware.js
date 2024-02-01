const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const cheerio = require("cheerio");
const { jsonAryUrlEncoded, asinseedAuthLogin } = require("../services/utils");
const credentialModel = require("../models/credential");
const FormData = require("form-data");
const fs = require("fs");

const asinseedMiddleware = (prefix) => createProxyMiddleware({
    target: `https://www.asinseed.com`,
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

            if (
                req.path == "/" ||
                (typeof req.user == "object" && !req.user.isAdmin && (
                    req.path === "/en/me/settings" ||
                    req.path === "/cn/me/settings" ||
                    req.path === "/en/me/order" ||
                    req.path === "/cn/me/order" ||
                    req.path === "/en/me/plan" ||
                    req.path === "/cn/me/plan" ||
                    req.path === "/en/me/subscription" ||
                    req.path === "/cn/me/subscription" ||
                    req.path === "/en/bbs" ||
                    req.path === "/cn/bbs"
                ))
            ) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/en";
                res.statusCode = 301;
                res.setHeader("location", domain + "/en");
            }

            if (req.path == "/do-auto-login") {
                try {
                    let { username, password } = await credentialModel.findOne({ "type": "asinseed" });
                    let result = await asinseedAuthLogin(username, password);
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
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://www.asinseed.com", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://www.asinseed.com", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                $("link[rel='canonical']").remove();
                let links = $("link");
                links.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://www.asinseed.com", domain));
                    }
                });
                let forms = $("form");
                forms.each(function () {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("https://www.asinseed.com", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        href = href.replace("https://www.asinseed.com", domain);
                        $(this).attr("href", href);
                    }
                    let onclick = $(this).attr("onclick");
                    if (onclick !== undefined) {
                        onclick = onclick.replace('https://www.asinseed.com', domain);
                        $(this).attr("onclick", onclick);
                    }
                });
                let scripts = $("script");
                scripts.each(function () {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        content = content.replaceAll(/https:\/\/www.asinseed.com/g, domain);
                        $(this).html(content);
                    } else {
                        src = src.replace('https://www.asinseed.com', domain);
                        $(this).attr("src", src);
                    }
                });
                $("#languageDropdownInvoker, #languageDropdown").remove();
                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $("#sidebarAccount").remove();
                }
                if (/\/signin/.test(req.path) || /\/en\/signin/.test(req.path) || /\/cn\/signin/.test(req.path)) {
                    const html = fs.readFileSync(__dirname + "/../views/asinseed-auth.ejs");
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
        referer: "https://www.asinseed.com",
        origin: "https://www.asinseed.com"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});

module.exports = asinseedMiddleware;