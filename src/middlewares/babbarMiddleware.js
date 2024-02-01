const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");
const fs = require("fs");
const cheerio = require("cheerio");
const { JSON_to_URLEncoded, babbarAuthLogin } = require("../services/utils");
const FormData = require("form-data");
const credentialModel = require("../models/credential");

const babbarMiddleware = (prefix) => createProxyMiddleware({
    target: `https://www.babbar.tech`,
    selfHandleResponse: true,
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        let userAgent = req.headers["user-agent"];
        let { cookie } = req.proxy;
        proxyReq.setHeader("user-agent", userAgent);
        proxyReq.setHeader("Cookie", cookie);
        if (req.headers['x-csrf-token']) {
            proxyReq.setHeader('x-csrf-token', req.headers['x-csrf-token']);
            proxyReq.setHeader('x-xsrf-token', req.cookies['XSRF-TOKEN']);
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
            if (req.path == "/" || (typeof req.user == "object" && !req.user.isAdmin && /\/settings/.test(req.path))) {
                proxyRes.statusCode = 301;
                proxyRes.headers["location"] = domain + "/dashboard";
                res.statusCode = 301;
                res.setHeader("location", domain + "/dashboard");
            }
            
            if (req.path == "/do-auto-login") {
                try {
                    let { username, password } = await credentialModel.findOne({"type": "babbar"});
                    let result = await babbarAuthLogin(username, password);
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
                proxyRes.headers["location"] = proxyRes.headers["location"].replace("https://www.babbar.tech", domain);
                res.setHeader("location", proxyRes.headers["location"].replace("https://www.babbar.tech", domain));
            }
            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                let response = responseBuffer.toString("utf-8");
                let $ = cheerio.load(response);
                let links = $("link");
                links.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://www.babbar.tech", domain));
                    }
                });
                let forms = $("form");
                forms.each(function() {
                    let action = $(this).attr("action");
                    if (action !== undefined) {
                        $(this).attr("action", action.replace("https://www.babbar.tech", domain));
                    }
                });
                let anchors = $("a");
                anchors.each(function() {
                    let href = $(this).attr("href");
                    if (href !== undefined) {
                        $(this).attr("href", href.replace("https://www.babbar.tech", domain));
                    }
                });
                let scripts = $("script");
                scripts.each(function() {
                    let src = $(this).attr("src");
                    if (src == undefined) {
                        let content = $(this).html();
                        let newContent = content.replace(/https:\/\/www.babbar.tech/g, domain);
                        if (/\/dashboard/.test(req.path) && content.includes("var offset = 0;")) {
                            $(this).html(`var offset = 0;
                            $(function () {
                    
                                $('.loading').html('■■')
                                getTopPv();
                                getGlobalStats();
                                $('#more').on('click', function (e) {
                                    e.preventDefault();
                                    $(this).hide();
                                    getTopPv();
                                })
                            })
                    
                            function getTopPv() {
                                $('.unload').show();
                                axios.post('/api/history', {
                                    offset: offset
                                })
                                    .then(function (response) {
                                        $.each(response.data, function (index, value) {
                                            $("#dataTable").append('<tr><td><span class="badge badge-primary">' + value.type + '</span></td><td><a href="/' + value.type + '/' + encodeURIComponent(value.url) + '">' + value.url + '</a></td><td><strong>' + (new Date(1000 * value.horodateur).toLocaleDateString()) + '</strong></td><td><a href="#" data-id="' + value.id + '" class="bin"><i class="fa fa-trash" aria-hidden="true"></i></a></td></tr>');
                                        })
                                        if (response.data.length == 10) {
                                            offset = offset + 1;
                                            $('#more').show();
                                        } else {
                                            $('#more').hide();
                                        }
                                        $('.unload').hide();
                                    })
                                    .catch(function (error) {
                                        window.location.href = "/logout";
                                    });
                            }
                    
                            $(document).on('click', '.bin', function (e) {
                                e.preventDefault();
                                id = $(this).attr('data-id')
                                $(this).parents('tr').remove();
                                axios.post('/api/history/remove', {
                                    id: id
                                })
                                    .then(function (response) {
                                    })
                                    .catch(function (error) {
                                        window.location.href = "/logout";
                                    });
                            })
                    
                            $(document).on('click', '#search', function (e) {
                                e.preventDefault()
                                window.location.href = "/keywords/" + encodeURIComponent($('#content').val()).toLowerCase();
                            });
                    
                            var cache = {};
                            $("#content").autocomplete({
                                minLength: 3,
                                source: function (request, response) {
                                    var term = request.term;
                                    if (term in cache) {
                                        response(cache[term]);
                                        return;
                                    }
                    
                                    $.getJSON("https://ac.babbar.tech/autocomplete?lang=fr&country=fr", request, function (data, status, xhr) {
                                        cache[term] = data;
                                        response(data);
                                    });
                                }
                            });
                    
                            function getGlobalStats() {
                                axios.get('/api/globalStats', {})
                                    .then(function (response) {
                                        $('#kl').html(parseInt(response.data.links).toLocaleString());
                                        $('#kwp').html(parseInt(response.data.pages).toLocaleString());
                                        $('#kh').html(parseInt(response.data.hosts).toLocaleString());
                                        $('#kd').html(parseInt(response.data.domains).toLocaleString());
                    
                                    })
                                    .catch(function (error) {
                                        window.location.href = "/logout"
                                    });
                            }`);
                        } else {
                            $(this).html(newContent);
                        }
                    } else {
                        $(this).attr("src", src.replace("https://www.babbar.tech", domain));
                    }
                });
                if (typeof req.user == "object" && !req.user.isAdmin) {
                    $("#navbarSupportedContent #dropdownMenuButton + div > a:first").remove();
                }
                if (req.path == "/login") {
                    let html = fs.readFileSync(__dirname + "/../views/babbar-auth.ejs");
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
        referer: "https://www.babbar.tech",
        origin: "https://www.babbar.tech"
    },
    autoRewrite: true,
    ws: true,
    timeout: 60000
});

module.exports = babbarMiddleware;