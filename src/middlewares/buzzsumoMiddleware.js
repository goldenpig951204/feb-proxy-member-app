const fs = require("fs");
const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const credentialModel = require("../models/credential");
const cheerio = require("cheerio");
const { JSON_to_URLEncoded, buzzsumoAuthLogin } = require("../services/utils");
const FormData = require("form-data");

const buzzsumoMiddleware = (prefix) => createProxyMiddleware({
    target: `https://app.buzzsumo.com`,
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
            if (req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
                return responseBuffer;
            }

            if (typeof req.user == 'object' && req.headers['referer'] && !(req.headers['referer'].includes(req.headers['host']))) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/discover/ideas";
                res.statusCode = 301;
                res.setHeader("location", domain + "/discover/ideas");
            }

            if (typeof req.user == "object" && !req.user.isAdmin && (
                /\/settings/.test(req.path) ||
                /\/logout/.test(req.path)
            )) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/discover/ideas";
                res.statusCode = 301;
                res.setHeader("location", domain + "/discover/ideas");
            }
            if (req.path == "/do-auto-login") {
                try {
                    let { username, password } = await credentialModel.findOne({"type": "buzzsumo"});
                    let result = await buzzsumoAuthLogin(username, password);
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
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://app.buzzsumo.com", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://app.buzzsumo.com", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let anchors = $("a");
                anchors.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://app.buzzsumo.com", domain));
                    }
                });
                let scripts = $("script");
                scripts.each(function() {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        let newContent = content.replace(/https:\/\/app.buzzsumo.com/g, domain);
                        $(this).html(newContent);
                    } else {
                        $(this).attr("src", src.replace("https://app.buzzsumo.com", domain))
                    }
                });
                $("head").append(`<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>`)
                $("head").append(`<script>
                    $(document).ready(function() {
                        $("nav a").click(function(ev) {
                            ev.preventDefault()
                            ev.stopPropagation()
                            let href = $(this).attr('href')
                            if (href) {
                                let domain = (new URL(href))
                                href = href.replace('https://' + domain.hostname, '${domain}');
                                location.href = href;
                            }
                        }) 
                        $("form").submit(function(ev) {
                            let action = $(this).attr("action")
                            let domain = (new URL(href))
                            action = action.replace('https://' + domain.hostname, '${domain}');
                            $(this).attr("action", action)
                        });
                    })
                </script>`)
                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $("head").append(`<style>
                        #headlessui-menu-button-20, 
                        #headlessui-menu-items-21,
                        #headlessui-menu-items-20 > a:nth-child(2) { 
                            display: none !important;
                        }
                    </style>`);
                }

                if (req.path == "/login") {
                    let html = fs.readFileSync(__dirname + "/../views/buzzsumo-auth.ejs");
                    return html.toString();
                }
                let content = $.html()
                content = content.replaceAll('https://app.buzzsumo.com', domain)
                console.log(content)
                return content;
            }
            return responseBuffer;
        }
    ),
    prependPath: true,
    secure: false,
    hostRewrite: true,
    headers: {
        referer: "https://app.buzzsumo.com",
        origin: "https://app.buzzsumo.com"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});



module.exports = buzzsumoMiddleware;