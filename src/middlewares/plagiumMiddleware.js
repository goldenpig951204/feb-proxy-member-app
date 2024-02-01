const fs = require("fs");
const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const cheerio = require("cheerio");
const { jsonAryUrlEncoded, plagiumAuthLogin } = require("../services/utils");
const FormData = require("form-data");
const credentialModel = require("../models/credential");
const domainOverviewModel = require("../models/domainOverview");
const settingModel = require("../models/setting");

const plagiumMiddleware = (prefix) => createProxyMiddleware({
    target: `https://premium.plagium.com`,
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

            if ((typeof req.user == "object" && !req.user.isAdmin) && (
                    /\/admin\/w+\/googledrive/.test(req.path) ||
                    /\/admin\/\w+\/credits/.test(req.path) ||
                    /\/admin\/\w+\/profile/.test(req.path) ||
                    /\/admin\/\w+\/email_preferences/.test(req.path) ||
                    /\/admin\/w+\/payment_history/.test(req.path) ||
                    /\/admin\/w+\/subscriptions/.test(req.path) ||
                    /\/admin\/w+\/parent_member/.test(req.path) ||
                    /\/admin\/w+\/cancel_account/.test(req.path)
            )) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/admin/en/dashboard";
                res.statusCode = 301;
                res.setHeader("location", domain + "/admin/en/dashboard");
            }

            if (req.path == "/check-limit") {
                let total, limit;
                const { id, username, isAdmin } = req.user;
                const { wpSite } = req;
                if (!isAdmin) {
                    res.statusCode = 200;
                    return JSON.stringify({
                        status: true
                    });
                } else {
                    if (req.body.type === "text") {
                        total = await domainOverviewModel.countRequests(id, username, wpSite, "plagium", "text");
                        limit = await settingModel.getOverviewLimit("plagiumTextLimit");
                    } else if (req.body.type === "url") {
                        total = await domainOverviewModel.countRequests(id, username, wpSite, "plagium", "url");
                        limit = await settingModel.getOverviewLimit("plagiumUrlLimit");
                    } else if (req.body.type === "file") {
                        total = await domainOverviewModel.countRequests(id, username, wpSite, "plagium", "file");
                        limit = await settingModel.getOverviewLimit("plagiumUrlLimit");
                    }
                    if (total >= limit) {
                        res.statusCode = 200;
                        return JSON.stringify({
                            status: false,
                            total: total,
                            limit: limit
                        });
                    } else {
                        res.statusCode = 200;
                        return JSON.stringify({
                            status: true
                        });
                    }
                }
            }

            if (req.path == "/do-auto-login") {
                try {
                    let { username, password } = await credentialModel.findOne({"type": "plagium"});
                    let result = await plagiumAuthLogin(username, password);
                    if (result) {
                        res.statusCode = 200;
                        return JSON.stringify({ status: true });
                    } else {
                        res.statusCode = 200;
                        return JSON.stringify({ status: false });
                    }
                } catch (err) {
                    res.statusCode = 200;
                    return JSON.stringify({status: false});
                }
            }

            if (proxyRes.headers["location"]) {
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://premium.plagium.com", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://premium.plagium.com", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let links = $("link");
                links.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://premium.plagium.com", domain));
                    }
                });
                let forms = $("form");
                forms.each(function() {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("https://premium.plagium.com", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://premium.plagium.com", domain));
                    }
                });
                let scripts = $("script");
                scripts.each(function() {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        let newContent = content.replaceAll("window.location.href = 'copyscape.com/keywords'", "window.location.href = 'https://payments.seozoom.it/keywords'");
                        newContent = newContent.replace(/https:\/\/premium.plagium.com/g, domain);
                        $(this).html(newContent);
                    } else {
                        if (src === "https://static.plagium.com/config/plagium/1.4.25/js/plagium.min.js?d=2019-12-04") {
                            $(this).attr("src", domain + "/js/plagium.js");
                        } else {
                            $(this).attr("src", src.replace("https://premium.plagium.com", domain));
                        }
                    }
                });


                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $("head").append(`<style>
                        ul#obj_sidebar > li:nth-child(3),
                        ul#obj_sidebar > li:nth-child(5),
                        ul#obj_sidebar > li:nth-child(6) > ul > li:nth-child(1),
                        ul#obj_sidebar > li:nth-child(6) > ul > li:nth-child(2),
                        ul#obj_sidebar > li:nth-child(6) > ul > li:nth-child(4),
                        ul#obj_sidebar > li:nth-child(6) > ul > li:nth-child(5),
                        ul#obj_sidebar > li:nth-child(6) > ul > li:nth-child(6),
                        ul#obj_sidebar > li:nth-child(6) > ul > li:nth-child(7),
                        .dropdown.user-menu > a > .pull-right-container,
                        .dropdown.user-menu > ul {
                            display: none;
                        }
                    </style>`)
                }

                if (/\/en\/login/.test(req.path)) {
                    let html = fs.readFileSync(__dirname + "/../views/plagium-auth.ejs");
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
        referer: "https://premium.plagium.com",
        origin: "https://premium.plagium.com"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});

module.exports = plagiumMiddleware;