const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const fs = require("fs");
const cheerio = require("cheerio");
const { jsonAryUrlEncoded, localrankerAuthLogin } = require("../services/utils");
const FormData = require("form-data");
const credentialModel = require("../models/credential");

const localrankerMiddleware = (prefix) => createProxyMiddleware({
    target: `https://app.localranker.fr`,
    selfHandleResponse: true,
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        let userAgent = req.headers["user-agent"];
        // let { cookie } = req.proxy;
        let cookie = "hubspotutk=cfa801be6c98f53f3238635dddbb97be; __hssrc=1; messagesUtk=13d6bfaa9dd54ae6ab81bcee04a8000b; __hstc=93687298.cfa801be6c98f53f3238635dddbb97be.1677772113398.1677772113398.1677794927473.2; _ga=GA1.2.1344715077.1677795005; _gid=GA1.2.784117195.1677795005; ajs_anonymous_id=cf4ec369-742f-40e6-bc3b-54f9af44523a; amplitude_idundefinedlocalranker.fr=eyJvcHRPdXQiOmZhbHNlLCJzZXNzaW9uSWQiOm51bGwsImxhc3RFdmVudFRpbWUiOm51bGwsImV2ZW50SWQiOjAsImlkZW50aWZ5SWQiOjAsInNlcXVlbmNlTnVtYmVyIjowfQ==; messagesUtk=13d6bfaa9dd54ae6ab81bcee04a8000b; _hjFirstSeen=1; _hjSession_2082213=eyJpZCI6IjIxZDE4MjVhLWZjNjMtNDQxMC04MDlhLTc3NWI1MDM2YjFjYyIsImNyZWF0ZWQiOjE2Nzc3OTUwNjYyNjIsImluU2FtcGxlIjp0cnVlfQ==; _hjAbsoluteSessionInProgress=1; _hjSessionUser_2082213=eyJpZCI6IjI3NzU5MDc0LTE2OWUtNTJjMy05MjliLTIzNDA3ZDRhNDE1MyIsImNyZWF0ZWQiOjE2Nzc3OTUwNjYyNTQsImV4aXN0aW5nIjp0cnVlfQ==; _hjIncludedInPageviewSample=1; _hjIncludedInSessionSample_2082213=1; __stripe_mid=4528267d-d032-4494-917d-85f22bfff83e469c42; __stripe_sid=196cf4ab-64a3-44c6-87d8-93e7ac2a7238991d19; ajs_user_id=3970; ajs_group_id=3123; amplitude_id_2fb122fc1f7ee2ca8f541d719a368b7clocalranker.fr=eyJkZXZpY2VJZCI6ImVkNGZjNjZlLWRlNWUtNGI1Ni1hMzY1LTUxMzU4ZTU3YzIzYlIiLCJ1c2VySWQiOiIzOTcwIiwib3B0T3V0IjpmYWxzZSwic2Vzc2lvbklkIjoxNjc3Nzk1MDMyNDg5LCJsYXN0RXZlbnRUaW1lIjoxNjc3Nzk3MjEzMjM3LCJldmVudElkIjozLCJpZGVudGlmeUlkIjo1LCJzZXF1ZW5jZU51bWJlciI6OH0=; _gat=1; __hssc=93687298.9.1677794927473";
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
                (
                    (typeof req.user == "object" && !req.user.isAdmin) && 
                    (
                        /\/user\/subscription/.test(req.path) ||
                        /\/user\/profile/.test(req.path) ||
                        /\/contact\/create/.test(req.path)
                    )
                )
            ) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/dashboard";
                res.statusCode = 301;
                res.setHeader("location", domain + "/dashboard");
            }

            if (req.path == "/do-auto-login") {
                try {
                    let { username, password } = await credentialModel.findOne({"type": "localranker"});
                    let result = await localrankerAuthLogin(username, password);
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
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://app.localranker.fr", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://app.localranker.fr", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let links = $("link");
                links.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://app.localranker.fr", domain));
                    }
                });
                let forms = $("form");
                forms.each(function() {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("https://app.localranker.fr", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://app.localranker.fr", domain));
                    }
                });
                let scripts = $("script");
                scripts.each(function() {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        let newContent = content.replaceAll("window.location.href = 'app.localranker.fr/keywords'", "window.location.href = 'https://app.localranker.fr/keywords'");
                        newContent = newContent.replace(/https:\/\/app.localranker.fr/g, domain);
                        $(this).html(newContent);
                    } else {
                        $(this).attr("src", src.replace("https://app.localranker.fr", domain));
                    }
                });
                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $(".menu6 + ul > li:nth-child(2)").css({ display: "none"});
                    $(".menu6 + ul > li:nth-child(3)").css({ display: "none"});
                    $(".menu6 + ul > li:nth-child(7)").css({ display: "none"});
                    $(".menu6 + ul > li:nth-child(8)").css({ display: "none"});
                }
                if (req.path == "/login") {
                    let html = fs.readFileSync(__dirname + "/../views/localranker-auth.ejs");
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
        referer: "https://app.localranker.fr",
        origin: "https://app.localranker.fr"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});

module.exports = localrankerMiddleware;