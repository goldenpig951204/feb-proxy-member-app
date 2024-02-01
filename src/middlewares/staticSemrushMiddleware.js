const {
    createProxyMiddleware,
    responseInterceptor
} = require("http-proxy-middleware");

const staticSemrushMiddleware = (prefix) => {
    return createProxyMiddleware({
        target: `https://static.semrush.com`,
        selfHandleResponse: true,
        changeOrigin: true,
        onProxyReq: (proxyReq, req) => {
            let userAgent = req.headers["user-agent"];
            proxyReq.setHeader("user-agent", userAgent);
        },
        onProxyRes: responseInterceptor(
            async (responseBuffer, proxyRes, req, res) => {
                let domain = `https://${req.headers['host']}`;
                if (req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
                    let data = responseBuffer.toString('utf8');
                    data = data.replaceAll(/https:\/\/static.semrush.com/g, domain);
                    let dataBuffer = Buffer.from(data, 'utf8');

                    return dataBuffer;
                }
            }
        ),
        prependPath: true,
        secure: false,
        hostRewrite: true,
        headers: {
            referer: `https://static.semrush.com`,
            origin: `https://static.semrush.com`
        },
        autoRewrite: true,
        ws: true
    });
}

module.exports = staticSemrushMiddleware;