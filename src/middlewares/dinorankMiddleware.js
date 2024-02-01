const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const cheerio = require("cheerio");
const { JSON_to_URLEncoded, dinorankAuthLogin } = require("../services/utils");
const FormData = require("form-data");
const credentialModel = require('../models/credential')

const dinorankMiddleware = (prefix) => createProxyMiddleware({
    target: `https://dinorank.com`,
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
            if (req.path == "/") {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/en/homed/";
                res.statusCode = 301;
                res.setHeader("location", domain + "/en/homed/");
            }

            if (req.path == '/do-auto-login') {
                try {
                    const { username, password } = await credentialModel.findOne({type: "dinorank"})
                    const result = await dinorankAuthLogin(username, password)
                    if (result) {
                        res.statusCode = 200;
                        return JSON.stringify({status: true})
                    } else {
                        res.statusCode = 200;
                        return JSON.stringify({status: false})
                    }
                } catch (err) {
                    res.statusCode = 200;
                    return JSON.stringify({status: false})
                }
            }

            if (typeof req.user == "object" && !req.user.isAdmin) {}
            if (proxyRes.headers["location"]) {
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://dinorank.com", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://dinorank.com", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let links = $("link");
                links.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://dinorank.com", domain));
                    }
                });
                let forms = $("form");
                forms.each(function() {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("https://dinorank.com", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://dinorank.com", domain));
                    }
                });
                let scripts = $("script");
                scripts.each(function() {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        let newContent;
                        if (content.includes('Login with user and password is needed') || content.includes('Es necesario logarse con usuario y clave antes de entrar') || content.includes('È necessario accedere con nome utente e password prima di entrare') || content.includes('Sie müssen sich mit Benutzer und Passwort anmelden')) {
                            newContent = `
                                $(document).ready(function() {
                                    var html = "<div class='container h-100 d-flex align-items-center justify-content-center'>";
                                        html += "<h4 class='alert alert-danger'>Please wait while we're establishing a session with asinseed servers. The operation may take up to 5 minutes. please be patient. Don't close this tab.</h4>";
                                        html += "</div>";
                                    $("html, body").addClass("h-100")
                                    $("body").html(html);
                                    $.ajax({
                                        url: "/do-auto-login",
                                        method: "GET",
                                        dataType: "json",
                                        processData: false,
                                        contentType: false,
                                        timeout: 360000
                                    }).done(function(data, textStatus, jqXHR) {
                                        window.location.replace("/en/homed");
                                    })
                                })`
                        } else {
                            newContent = content.replace(/https:\/\/dinorank.com/g, domain);
                        }
                        $(this).html(newContent);
                    } else {
                        $(this).attr("src", src.replace("https://dinorank.com", domain));
                    }
                });
                if (typeof req.user == "object" && !req.user.isAdmin) {
                   if (/\/usuario/.test(req.path)) {
                        $(".interiorContenedor ul.tabs li:nth-child(2), .interiorContenedor ul.tabs li:nth-child(3)").remove();
                        $("#user-account-info, #user-invoices").remove();
                   }
                }
                let menus = $("#interiorMenu > div");
                menus.each(function() {
                    let onclick = $(this).attr("onclick");
                    if (onclick !== undefined) {
                        $(this).attr("onclick", onclick.replace("https://dinorank.com", domain));
                    }
                });
                if (/\/home/.test(req.path)) {
                    let divs = $("#dashboardRastreo > div");
                    divs.each(function() {
                        let onclick = $(this).attr("onclick");
                        if (onclick !== undefined) {
                            $(this).attr("onclick", onclick.replace("https://dinorank.com", domain));
                        }
                    });
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
        referer: "https://dinorank.com",
        origin: "https://dinorank.com"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});



module.exports = dinorankMiddleware;