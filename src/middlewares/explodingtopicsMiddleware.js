const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const cheerio = require("cheerio");
const { jsonAryUrlEncoded } = require("../services/utils");
const FormData = require("form-data");
const credentialModel = require("../models/credential");
const settingModel = require("../models/setting");

const explodingtopicsMiddleware = (prefix) => createProxyMiddleware({
    target: `https://explodingtopics.com`,
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
            
            if (proxyRes.headers['set-cookie'] !== undefined) {
                let cookies = proxyRes.headers['set-cookie'];
                if (cookies.find(cookie => cookie.includes("PHPSESSID"))) {
                    let newCookie = "";
                    for (let cookie of cookies) {
                        newCookie += cookie.split("; ")[0] + "; ";
                    }
                    await settingModel.findOneAndUpdate(null, {
                        seozoomCookie: newCookie
                    }, {
                        upsert: true
                    });
                }
            }

            if ((
                typeof req.user == "object" && !req.user.isAdmin) && 
                (/\/account/.test(req.path) || /\/pro\/api/.test(req.path))
            ) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/pro/dashboard";
                res.statusCode = 301;
                res.setHeader("location", domain + "/pro/dashboard");
            }

            if (req.path == "/do-auto-login") {
                try {
                    let { username, password } = await credentialModel.findOne({"type": "seozoom"});
                    res.statusCode = 200;
                    return JSON.stringify({
                        status: true,
                        user: {
                            email: username,
                            password: password
                        }
                    });
                } catch (err) {
                    res.statusCode = 200;
                    return JSON.stringify({status: false});
                }
            }

            if (proxyRes.headers["location"]) {
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://explodingtopics.com", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://explodingtopics.com", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let links = $("link");
                links.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://explodingtopics.com", domain));
                    }
                });
                let forms = $("form");
                forms.each(function() {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("https://explodingtopics.com", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://explodingtopics.com", domain));
                    }
                });
                let scripts = $("script");
                scripts.each(function() {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        let newContent = content.replaceAll("window.location.href = 'explodingtopics.com/keywords'", "window.location.href = 'https://payments.seozoom.it/keywords'");
                        newContent = newContent.replace(/https:\/\/explodingtopics.com/g, domain);
                        $(this).html(newContent);
                    } else {
                        $(this).attr("src", src.replace("https://explodingtopics.com", domain));
                    }
                });
                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $("body").append(`
                        <script src="https://code.jquery.com/jquery-3.6.3.min.js"></script>
                        <script>jQuery(document).ready(function() {
                            $(".proNavLinkContainer:nth-child(10)").css("display", "none");
                            $(".proNavLinkMinor:nth-child(1)").css("display", "none");
                        });</script>`)
                }
                if (/\/login/.test(req.path)) {
                    
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
        referer: "https://explodingtopics.com",
        origin: "https://explodingtopics.com"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});

module.exports = explodingtopicsMiddleware;