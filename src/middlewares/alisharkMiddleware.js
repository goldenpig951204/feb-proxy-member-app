const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const cheerio = require("cheerio");
const { jsonAryUrlEncoded, alisharkAuthLogin } = require("../services/utils");
const credentialModel = require("../models/credential");
const FormData = require("form-data");
const fs = require("fs");

const alisharkMiddleware = (prefix) => createProxyMiddleware({
    target: `https://alishark.com`,
    selfHandleResponse: true,
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        let userAgent = req.headers["user-agent"];
        let { cookie } = req.proxy;
        proxyReq.setHeader("user-agent", userAgent);
        proxyReq.setHeader("Cookie", cookie.split("auth=")[0]);

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

            if (typeof req.user == "object" && !req.user.isAdmin && (
                req.path == "/api/me/settings" ||
                req.path == "/api/me/avatar"
            )) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain;
                res.statusCode = 301;
                res.setHeader("location", domain);
            }

            if (req.path == "/do-auto-login") {
                let { username, password } = await credentialModel.findOne({ "type": "alishark" });
                if (username && password) {
                    res.statusCode = 200;
                    return JSON.stringify({ status: true, email: username, password: password });
                } else {
                    res.statusCode = 200;
                    return JSON.stringify({ status: false });
                }
            }

            if (proxyRes.headers["location"]) {
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://alishark.com", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://alishark.com", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let links = $("link");
                links.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://alishark.com", domain));
                    }
                });
                let forms = $("form");
                forms.each(function () {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("https://alishark.com", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        href = href.replace("https://alishark.com", domain);
                        $(this).attr("href", href);
                    }
                });
                let scripts = $("script");
                scripts.each(function () {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        content = content.replaceAll(/https:\/\/alishark.com/g, domain);
                        $(this).html(content);
                    } else {
                        if (/\/dashboard\/js\/app.js/.test(src)) {
                            $(this).attr("src", domain + "/js/alishark.js");
                        } else {
                            $(this).attr("src", src.replace("https://alishark.com", domain));
                        }
                    }
                });

                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $("head").append(`<style>
                        .profile__center--2vFFR .formGroup,
                        .profile__links--2JoSW > li:nth-child(1),
                        .profile__links--2JoSW > li:nth-child(2),
                        .profile__links--2JoSW + div > div:not(:nth-child(1)),
                        .auth-actions__actions--JLie6 > div:nth-child(2) {
                            display: none
                        }
                        .auth-actions__actions--JLie6 div:first-child {
                            border-right: none !important;
                        }
                    </style>`);
                }
                if (/\/login/.test(req.path)) {
                    const html = fs.readFileSync(__dirname + "/../views/alishark-auth.ejs");
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
        referer: "https://alishark.com",
        origin: "https://alishark.com"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});

module.exports = alisharkMiddleware;