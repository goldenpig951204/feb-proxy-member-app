const fs = require('fs');
const path = require('path');
const handleHelpers = require('../services/handleHelpers');
const utils = require('../services/utils');

const getMcopProxyJsFileContent = async function(jsFileName, fileType, isObfuscated = true) {
    let fullPath = "";
    let obfucatedFullPath = "";
    let finalJsStream = "";
    if (/mcop-sw123456789\.js/i.test(jsFileName)) {
        fullPath = path.join(__dirname, "../public/frontend-compos/mcop-sw-ab$012345.js");
        switch (fileType) {
            case 2:
                obfucatedFullPath = path.join(__dirname, "../public/frontend-compos/mcop-sw-ab$012345-staticless--with-fonts-obfus.js");
                break;
            case 1:
                obfucatedFullPath = path.join(__dirname, "../public/frontend-compos/mcop-sw-ab$012345-staticless-obfus.js");
                break;
            default:
                obfucatedFullPath = path.join(__dirname, "../public/frontend-compos/mcop-sw-ab$012345-obfus.js");
                break;
        }
    } else if (/mcop-compos123456789\.js/i.test(jsFileName)) {
        fullPath = path.join(__dirname, "../public/frontend-compos/mcop-components-ab$012345.js");
        switch (fileType) {
            case 2:
                obfucatedFullPath = path.join(__dirname, "../public/frontend-compos/mcop-components-ab$012345-staticless--with-fonts-obfus.js");
                break;
            case 1:
                obfucatedFullPath = path.join(__dirname, "../public/frontend-compos/mcop-components-ab$012345-staticless-obfus.js");
                break;
            default:
                obfucatedFullPath = path.join(__dirname, "../public/frontend-compos/mcop-components-ab$012345-obfus.js");
                break;
        }
    }

    if (typeof obfucatedFullPath === 'string' && obfucatedFullPath.length > 0) {
        const staticlessStr = `return this.utils.proxyMethods.ALL_STATIC_FILES_SKIPPED;`;
        const staticlessWithFontsStr = `return this.utils.proxyMethods.FONT_FILES_NOT_SKIPPED;`;

        if (isObfuscated) {
            if (! fs.existsSync(obfucatedFullPath)) {
                const fileContent = await handleHelpers.getLocalJsFile(fullPath); // File's content is obfuscated here
                switch (fileType) {
                    case 2:
                        await utils.writeFile(obfucatedFullPath, fileContent.replace(/return\s+this.utils.proxyMethods.PROXY_ALL_FILES;/m, staticlessWithFontsStr));
                        break;
                    case 1:
                        await utils.writeFile(obfucatedFullPath, fileContent.replace(/return\s+this.utils.proxyMethods.PROXY_ALL_FILES;/m, staticlessStr));
                        break;
                    default:
                        await utils.writeFile(obfucatedFullPath, fileContent);
                        break;
                }
            }
            finalJsStream = fs.readFileSync(obfucatedFullPath, 'utf8')
            // finalJsStream = fs.createReadStream(obfucatedFullPath);
        } else {
            finalJsStream = fs.createReadStream(fullPath);
        }
    }
    return finalJsStream;
};


const mcopMiddleware = async (req, res, next) => {
    if (handleHelpers.isMcoProxyPart(req.url)) {
        const jsCodeStream = await getMcopProxyJsFileContent(req.url, 0);
        res.header('content-type', 'application/javascript');
        return res.send(jsCodeStream);
    } else {
        next();
    }
}

module.exports = mcopMiddleware;