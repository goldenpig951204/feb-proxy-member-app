const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const cheerio = require("cheerio");
const { jsonAryUrlEncoded, linkodyAuthLogin } = require("../services/utils");
const credentialModel = require("../models/credential");
const FormData = require("form-data");
const fs = require("fs");

const linkodyMiddleware = (prefix) => createProxyMiddleware({
    target: `https://www.linkody.com`,
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
                    req.path == "/en/account" ||
                    req.path == "/fr/account" ||
                    req.path == "/users/manage" ||
                    req.path == "/en/ahrefs/openapp/connect" ||
                    req.path == "/e/ahrefs/openapp/connect" ||
                    req.path == "/en/logout" ||
                    req.path == "/fr/logout"
                ))
            ) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/en/domains";
                res.statusCode = 301;
                res.setHeader("location", domain + "/en/domains");
            }

            if (req.path == "/do-auto-login") {
                try {
                    let { username, password } = await credentialModel.findOne({ "type": "linkody" });
                    let result = await linkodyAuthLogin(username, password);
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
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://www.linkody.com", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://www.linkody.com", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                $("link[rel='canonical']").remove();
                let links = $("link");
                links.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://www.linkody.com", domain));
                    }
                });
                let forms = $("form");
                forms.each(function () {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("https://www.linkody.com", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        href = href.replace("https://www.linkody.com", domain);
                        $(this).attr("href", href);
                    }
                });
                let scripts = $("script");
                scripts.each(function () {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        content = content.replaceAll(/https:\/\/www.linkody.com/g, domain);
                        $(this).html(content);
                    } else {
                        $(this).attr("src", src.replace("https://www.linkody.com", domain));
                    }
                });
                $("#switch-lang").remove();
                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $("#user .ld-menu > li:nth-child(1), #user .ld-menu > li:nth-child(4), #user .ld-menu > li:nth-child(10), #content .views li:nth-child(5)").remove();
                }
                if (/\/en\/login/.test(req.path) || /\/fr\/login/.test(req.path)) {
                    const html = fs.readFileSync(__dirname + "/../views/linkody-auth.ejs");
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
        referer: "https://www.linkody.com",
        origin: "https://www.linkody.com"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});

module.exports = linkodyMiddleware;