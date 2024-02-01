const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const cheerio = require("cheerio");
const { JSON_to_URLEncoded } = require("../services/utils");
const FormData = require("form-data");
const axios = require("axios");
const ProxyModel = require('../models/proxy')

const semrushMiddleware = (prefix) => {
    return createProxyMiddleware({
        target: `https://${prefix}.semrush.com`,
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
                        if (Array.isArray(req.body[name])) {
                            form.append(name + "[]", req.body[name][0]);
                        } else {
                            form.append(name, req.body[name]);
                        }
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
                let staticProxy = await ProxyModel.findOne({ type: "static.semrush" });
                let staticDomain = `https://${staticProxy.domain}`;
                if (req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
                    let dataBuffer;
                    if (req.url.match(/\.(css|json|js)/)) {
                        let data = responseBuffer.toString('utf8');
                        data = data.replaceAll(/https:\/\/static.semrush.com/g, staticDomain);
                        dataBuffer = Buffer.from(data, 'utf8');
                    } else {
                        dataBuffer = responseBuffer;
                    }
                    
                    return dataBuffer;
                }
                if (proxyRes.headers["location"]) {
                    let locale = "", target = "";
                    try {
                        let url = new URL(proxyRes.headers.location);
                        target = url.origin;
                        locale = url.hostname.split(".")[0];
                    } catch (err) {
                        target = `https://${prefix}.semrush.com`;
                    }

                    if (proxyRes.statusCode == 302) {
                        if (/^(http|https)/.test(proxyRes.headers["location"])) {
                            proxyRes.headers["location"] = `/lang/semrush?prefix=${locale}`;
                            res.setHeader("location", `/lang/semrush?prefix=${locale}`);
                        }
                    } else {
                        proxyRes.headers["location"] = proxyRes.headers["location"].replace(target, domain);
                        res.setHeader("location", proxyRes.headers["location"].replace(target, domain));
                    }
                }

                if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                    let response = responseBuffer.toString("utf-8");
                    let $ = cheerio.load(response);
                    $("head").append("<script src='https://code.jquery.com/jquery-3.6.1.min.js' integrity='sha256-o88AwQnZB+VDvE9tvIXrMQaPlFFSUTR+nldQm1LuPXQ=' crossorigin='anonymous'></script>");
                    $("head").append("<script src='/js/semrush.js' type='text/javascript'></script>");
                    $(".srf-switch-locale-trigger").remove();
                    $(".srf-header .srf-navbar__right .srf-login-btn, .srf-header .srf-navbar__right .srf-register-btn").remove();

                    // let scripts = $("script");
                    // for (let i = 0; i < scripts.length; i++) {
                    //     let src = $(scripts[i]).attr("src");
                    //     if (/https:\/\/static.semrush.com\/siteaudit\//.test(src)) {
                    //         let { data } = await axios.get(src);
                    //         let locale = "en";
                    //         if (prefix === "www") {
                    //             locale = "en";
                    //         } else {
                    //             locale = prefix;
                    //         }
                    //         let content = data.replaceAll(/https:\/\/static.semrush.com\/siteaudit\/i18n\/messages_\${\w}.\w+.json/g, `${domain}/siteaudit/i18n/messages_${locale}.json`);
                    //         $("body").append(`<script name='serii_balynskyi'>${content}</script>`)
                    //         $(scripts[i]).remove();
                    //     }
                    // }
                    
                    if (!req.user.isAdmin) {
                        if (req.url == "/accounts/profile/account-info" || req.url == "/billing-admin/profile/subscription") {
                            $(".srf-layout__sidebar, .srf-layout__body").remove();
                            $(".srf-layout__footer").before("<h1 style='grid-area: footer; display: block; margin-top: -150px; text-align: center; font-size: 40px; color: #ff642d; font-weight: bold'>You can not access in this page.</h1>");
                        }
                        $(".srf-navbar__right").remove();
                    }

                    let content = $.html();
                    let locale = "en";
                    if (prefix === "www") {
                        locale = "en";
                    } else {
                        locale = prefix;
                    }
                                        
                    // content = content.replaceAll(/https:\/\/static.semrush.com\/siteaudit\/i18n\/messages_\${\w}.\w+.json/g, `${domain}/siteaudit/i18n/messages_${locale}.json`);
                    return content;
                }
                return responseBuffer;
            }
        ),
        prependPath: true,
        secure: false,
        hostRewrite: true,
        headers: {
            referer: `https://${prefix}.semrush.com`,
            origin: `https://${prefix}.semrush.com`
        },
        autoRewrite: true,
        ws: true
    });
}

module.exports = semrushMiddleware;