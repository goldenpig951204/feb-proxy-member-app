const querystring = require('node:querystring');
const cheerio = require('cheerio')
const webClient = require('../services/clientHelpers').create();
const handleHelper = require('../services/handleHelpers');
const { isStaticRes, randomUserAgent, unzip, inflate, brotliDecompress, iconscoutAutoLogin } = require('../services/utils');
const credentialModel = require('../models/credential');

const SERVICE_MAIN_DOMAIN = 'iconscout.com';
const SERVICE_ROOT_DOMAIN = 'iconscout.com';

const index = async (req, res) => {
    if (/^\/do-auto-login$/.test(req.url)) {
        try {
            const { username, password } = await credentialModel.findOne({
                type: 'iconscout'
            });

            const result = await iconscoutAutoLogin(username, password);

            if (result) {
                return res.json({ status: true });
            } else {
                return res.json({ status: false });
            }
        } catch (err) {
            return res.json({ status: false });
        }
    }

    let targetedUrl = req.url;
    let targetedHost = SERVICE_MAIN_DOMAIN;
    let portNumber = 443;
    let refererUrl = '';
    if (typeof req.headers['referer'] !== 'undefined') {
        refererUrl = handleHelper.getRealReferer(targetedHost, req.headers['host'], req.headers['referer']);
    }

    if (handleHelper.urlContainsOriginalHost(req.url)) {
        targetedUrl = handleHelper.removeOriginalHost(req.url);
        targetedUrl = handleHelper.removeVarFromUrl(targetedUrl, '_mcop-scope');
        targetedHost = handleHelper.extractOriginalHost(req.url);

        if (handleHelper.containsPortNumber(targetedHost)) {
            portNumber = handleHelper.extractPortNumber(targetedHost);
            targetedHost = handleHelper.stripPortNumber(targetedHost);
        }
    } else if (handleHelper.urlContainsOriginalHost(req.headers['referer'])) {
        targetedHost = handleHelper.extractOriginalHost(req.headers['referer'] + '');
    }

    const realFullUrl = `https://${targetedHost}${targetedUrl}`;
    const requestFullUrl = `${req.protocol}://${req.headers['host']}`;
    const serviceDomainRegExp = new RegExp(SERVICE_ROOT_DOMAIN.replace(/\./, '\.'));

    if (!isStaticRes(req.url) && serviceDomainRegExp.test(targetedHost)) {
        if (typeof req.user == 'object' && !req.user.isAdmin && isForbiddenUrl(req.url)) {
            res.header('location', '/');
            return res.status(302).send('Redirecting...');
        }
    }

    const excludedHeaders = [
        'cookie', 
        'user-agent', 
        'sec-ch-ua', 
        'sec-ch-ua-mobile', 
        'sec-ch-ua-platform',
        'sec-fetch-user', 
        'upgrade-insecure-requests', 
        'host',
        'connection', 
        'pragma', 
        'accept-language', 
        'x-real-ip',
        'x-forwarded-for', 
        'x-hubspot-messages-url', 
        'accept-encoding'
    ];

    const someHeadersValue = {
        'origin': `https://${SERVICE_MAIN_DOMAIN}`,
        'referer': refererUrl
    }

    const allowedRequestHeaders = handleHelper.filterRequestHeaders(req.headers, excludedHeaders, someHeadersValue);
    if (typeof req.headers['origin'] !== 'undefined') {
        allowedRequestHeaders['origin'] = `https://${SERVICE_MAIN_DOMAIN}`;
    }

    allowedRequestHeaders['user-agent'] = randomUserAgent(0);

    const { cookie } = req.proxy;    
    allowedRequestHeaders['cookie'] = cookie;

    let requestData = '';
    if (['post', 'patch', 'put'].includes(req.method.toString().toLowerCase())) {
        if (/multipart\/form-data/i.test(req.headers['content-type'])) {
            const parts = (req.headers['content-type'] + '').split(/boundary=/);
            const boundary = parts[1];

            const form = new FormData();
            form.setBoundary(boundary);

            const data = request.body;
            for (let name in data) {
                form.append(name, data[name]);
            }

            requestData = form.getBuffer().toString('utf8');
        } else if (/application\/json/i.test(req.headers['content-type'])) {
            requestData = JSON.stringify(req.body);
        } else if (/application\/x-www-form-urlencoded/i.test(req.headers['content-type'])) {
            requestData = req.body = querystring.parse(req.body);
        } else {
            requestData = JSON.stringify(req.body);
        }
        const domainRegExp = new RegExp(req.headers['host'], 'mg');
        const encodedDomainRegExp = new RegExp(querystring.escape(req.headers['host']), 'mg');
        const mcoppRegExp = new RegExp(querystring.escape('__mcopp="1"'), 'mg');
        requestData = requestData.replace(domainRegExp, targetedHost).replace(new RegExp(handleHelper.MCOP_LOCATION_STR, 'mg'), 'location');
        requestData = requestData.replace(domainRegExp, targetedHost);
        requestData = requestData.replace(encodedDomainRegExp, targetedHost);
        requestData = requestData.replace(mcoppRegExp, '');
        allowedRequestHeaders['content-length'] = Buffer.byteLength(requestData);
    }
    
    let serverRes = undefined;

    webClient.setTimeout(180000);
    webClient.acceptUnverifiedSslCertificates();

    if (typeof portNumber !== 'undefined') {
        webClient.setPort(portNumber);
    }

    await webClient.sendRequest(req.method, targetedHost, targetedUrl, allowedRequestHeaders, requestData).then(serverResponse => {
        serverRes = serverResponse;
    });

    let body = '';
    let receivedData = serverRes.body;
    let statusCode = serverRes.statusCode;

    const headersToBlock = [
        'set-cookie',
        'content-encoding',
        'access-control-allow-origin',
        'content-security-policy',
        'transfer-encoding',
        'content-security-policy-report-only',
        'x-frame-options'
    ];

    let regExpStr = '';
    const lastIndex = headersToBlock.length - 1;
    for (let i = 0; i < headersToBlock.length; i++) {
        if (i < lastIndex) {
            regExpStr += headersToBlock[i] + '|';
        } else {
            regExpStr += headersToBlock[i];
        }
    }

    const skippedHeaderRegExp = new RegExp(regExpStr);
    for (let name in serverRes.headers) {
        if (!skippedHeaderRegExp.test(name + '')) {
            res.header(name, serverRes.headers[name]);
        }
    }

    if (typeof serverRes.headers['set-cookie'] !== 'undefined' && !isStaticRes(req.url)) {
        // cookie update
    }

    if (typeof serverRes.headers['location'] !== 'undefined') {
        let redirectUrl = serverRes.headers['location'];
        if (/^\//.test(redirectUrl)) {
            redirectUrl = `https://${targetedHost}${redirectUrl}`;
        }
        const newLocation = handleHelper.modifyUrl(redirectUrl, req.headers['host']);
        res.header('location', newLocation);
        return res.status(statusCode).send('Redirecting...');
    }

    let isEncoded = false;
    body = Buffer.concat(receivedData);

    if (handleHelper.shouldBeDecompressed(serverRes.headers['content-type'])) {
        if (receivedData.length > 0) {
            if (/gzip/i.test(serverRes.headers['content-encoding'] + '')) {
                body = await unzip(body);
                isEncoded = true;
            } else if (/deflate/i.test(serverRes.headers['content-encoding'] + '')) {
                body = await inflate(body);
                isEncoded = true;
            } else if (/br/i.test(serverRes.headers['content-encoding'] + '')) {
                body = await brotliDecompress(body);
                isEncoded = true;
            }
        }
    } else {
        if (typeof serverRes.headers['content-encoding'] !== 'undefined') {
            res.header('content-encoding', serverRes.headers['content-encoding']);
        }
    }

    if (handleHelper.mimeIsHtml(serverRes.headers['content-type'] + '')) {
        body = body.toString();
        if (body.length > 0) {
            body = handleHelper.injectJsScriptInHead(body, `https://${req.headers['host']}/mcop-compos123456789.js`);
            body = handleHelper.injectPageBase(body, requestFullUrl, realFullUrl);

            const $ = cheerio.load(body);
            body = removeInlineContentSecurityPolicy($);
            body = removeUnlessParts(req, $);
            if (noConnected($)) {
                return res.render('iconscout-auth');
            }
        }
    } else if (handleHelper.mimeIsJs(serverRes.headers['content-type'] + '') || /\.js/.test(req.url)) {
        if (typeof serverRes.headers['content-type'] === 'undefined') {
            res.header('content-type', 'application/javascript');
        }

        body = body.toString();
        
        try {
            let temp = body;
            temp = handleHelper.replacePostMessageAndLocation(temp);
            body = temp;
        } catch (err) {
            console.log(err.message);
        }
    }

    return res.status(statusCode).send(body);
}

const isForbiddenUrl = (url) => {
    return typeof url !== 'string' || /\/dashboard|\/logout|\/pricing/i.test(url);
}

const removeInlineContentSecurityPolicy = ($) => {
    const metaElts = $('meta');
    metaElts.each(function () {
        const current = $(this);
        if (/Content-Security-Policy/i.test(current.attr('http-equiv'))) {
            current.remove();
        }
    });

    return $.html();
}

const removeUnlessParts = (req, $) => {
    const anchors = $('a');
    const links = $('link');
    const scripts = $('script');
    const images = $('img');
    const forms = $('form');
    const iframes = $('iframe');

    // anchors.each(function() {
    //     const href = $(this).attr('href');
    //     if (/^\//.test(href)) {
    //         $(this).attr('href', `https://${SERVICE_MAIN_DOMAIN}${href}`);
    //         $(this).attr('__mcopp', '1');
    //     }
    //     $(this).removeAttr('integrity');
    // });

    links.each(function() {
        const href = $(this).attr('href');
        if (/^\//.test(href)) {
            $(this).attr('href', `https://${SERVICE_MAIN_DOMAIN}${href}`);
            $(this).attr('__mcopp', '1');
        }
        $(this).removeAttr('integrity');
    });

    scripts.each(function() {
        const src = $(this).attr('src');
        if (/^\//.test(src)) {
            $(this).attr('src', `https://${SERVICE_MAIN_DOMAIN}${src}`);
            $(this).attr('__mcopp', '1');
        }
        $(this).removeAttr('integrity');
    });

    images.each(function() {
        const src = $(this).attr('src');
        if (/^\//.test(src)) {
            $(this).attr('src', `https://${SERVICE_MAIN_DOMAIN}${src}`);
            $(this).attr('__mcopp', '1');
        }
        $(this).removeAttr('integrity');
    });
    
    // forms.each(function() {
    //     const action = $(this).attr('action');
    //     if (/^\//.test(action)) {
    //         $(this).attr('action', `https://${SERVICE_MAIN_DOMAIN}${action}`);
    //         $(this).attr('__mcopp', '1');
    //     }
    //     $(this).removeAttr('integrity');
    // });

    iframes.each(function() {
        const src = $(this).attr('src');
        if (/^\//.test(src)) {
            $(this).attr('src', `https://${SERVICE_MAIN_DOMAIN}${src}`);
            $(this).attr('__mcopp', '1');
        }
        $(this).removeAttr('integrity');
    });

    return $.html();
}

const noConnected = ($) => {
    if ($("#mainMasterHeader > header > nav > ul > li:nth-child(5)").text().trim() === 'Log in') {
        return true;
    } else {
        return false;
    }
}

module.exports = index;
