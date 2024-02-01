const fs = require('fs');
const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const cheerio = require("cheerio");
const { JSON_to_URLEncoded, espinnerAuthLogin } = require("../services/utils");
const FormData = require("form-data");
const credentialModel = require('../models/credential');

const espinnerMiddleware = (prefix) => createProxyMiddleware({
    target: `http://espinner.net`,
    selfHandleResponse: true,
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        let userAgent = req.headers["user-agent"];
        let { cookie } = req.proxy;
        proxyReq.setHeader("user-agent", userAgent);
        proxyReq.setHeader("Cookie", cookie);

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
                let body = JSON_to_URLEncoded(req.body);
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

            if (req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/) || /^\/ajax/.test(req.path)) {
                return responseBuffer;
            }
            if (req.path == "/" || (
                typeof req.user == "object" && !req.user.isAdmin && (
                    req.path == "/miembros/profile" ||
                    req.path == "/miembros/member/payment-history" ||
                    req.path == "/miembros/helpdesk/index/p/index/index" ||
                    req.path == "/programa-de-afiliados.html"
                )
            )) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/miembros/content/p/id/1/";
                res.statusCode = 301;
                res.setHeader("location", domain + "/miembros/content/p/id/1/");
            }
            if (req.path == "/do-auto-login") {
                try {
                    let { username, password } = await credentialModel.findOne({"type": "espinner"});
                    let result = await espinnerAuthLogin(username, password);
                    if (result) {
                        res.statusCode = 200;
                        return JSON.stringify({status: true});
                    } else {
                        res.statusCode = 200;
                        return JSON.stringify({status: false});
                    }
                } catch (err) {
                    res.statusCode = 200;
                    return JSON.stringify({status: false});
                }
            }
            if (proxyRes.headers["location"]) {
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("http://espinner.net", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("http://espinner.net", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let links = $("link");
                links.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        console.log(href)
                        href = href.replace("/miembros/application/default/themes/espinner/public/assets/skin/default_skin/css/theme.css", domain + "/css/espinner.css");
                        $(this).attr("href", href.replace("http://espinner.net", domain));
                    }
                });
                let forms = $("form");
                forms.each(function () {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("http://espinner.net", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function () {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("http://espinner.net", domain));
                    }
                });
                let scripts = $("script");
                scripts.each(function () {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        let newContent = content.replace(/https:\/\/espinner.net/g, domain);
                        $(this).html(newContent);
                    } else {
                        $(this).attr("src", src.replace("http://espinner.net", domain));
                    }
                });
                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $(".sidebar-menu > li:nth-child(8), .sidebar-menu > li:nth-child(9)").remove();
                    $("#apikey, .navbar-right .dropdown > a .caret, .navbar-right .dropdown > ul, #menu-payment-history, #menu-profile, #menu-helpdesk").remove();
                    if (/\/miembros\/login/.test(req.path)) {
                        let html = fs.readFileSync(__dirname + "/../views/espinner-auth.ejs");
                        return html.toString();
                    }
                }


                let content = $.html();
                content = content.replaceAll("http://espinner.net", domain);

                return content;
            }
            return responseBuffer;
        }
    ),
    prependPath: true,
    secure: false,
    hostRewrite: true,
    headers: {
        referer: "http://espinner.net",
        origin: "http://espinner.net"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});



module.exports = espinnerMiddleware;