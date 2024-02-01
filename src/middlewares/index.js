const settingModel = require("../models/setting");
const proxyModel = require("../models/proxy");
const domainOverviewModel = require("../models/domainOverview");
const keywordOverviewModel = require("../models/keywordOverview");
const pipiadsOverviewModel = require("../models/pipiadsOverview");
const exportOverviewModel = require("../models/exportOverview");

const authMiddleware = require("./authMiddleware");
const memberMiddleware = require("./memberMiddleware");
const jsonMiddleware = require("./jsonMiddleware");
const mcopMiddleware = require('./mcopMiddleware');

const semrushMiddleware = require("./semrushMiddeware");
const staticSemrushMiddleware = require("./staticSemrushMiddleware");
const spyfuMiddleware = require("./spyfuMiddleware");
const seolyzeMiddleware = require("./seolyzeMiddleware");
const linkcentaurMiddleware = require("./linkcentaurMiddleware");
const spamzillaMiddleware = require("./spamzillaMiddleware");
const seodityMiddleware = require("./seodityMiddleware");
const rytrmeMiddleware = require("./rytrmeMiddleware");
const sistrixMiddleware = require("./sistrixMiddleware");
const wordaiMiddleware = require("./wordaiMiddleware");
const keywordMiddleware = require("./keywordMiddleware");
const nichescraperMiddleware = require("./nichescraperMiddleware");
const pipiadsMiddleware = require("./pipiadsMiddleware");
const keywordkegMiddleware = require("./keywordkegMiddleware");
const paraphraserMiddleware = require("./paraphraserMiddleware");
const buzzsumoMiddleware = require("./buzzsumoMiddleware");
const articleforgeMiddleware = require("./articleforgeMiddleware");
const bigspyMiddleware = require("./bigspyMiddleware");
const colinkriMiddleware = require("./colinkriMiddleware");
const dinorankMiddleware = require("./dinorankMiddleware");
const yourtextMiddleware = require("./yourtextMiddleware");
const babbarMiddleware = require("./babbarMiddleware");
const firstfrMiddleware = require("./firstfrMiddleware");
const textoptimizerMiddleware = require("./textoptimizerMiddleware");
const onehourindexingMiddleware = require("./onehourindexingMiddleware");
const ranxplorerMiddleware = require("./ranxplorerMiddleware");
const majesticMiddleware = require("./majesticMiddleware");
const woorankMiddleware = require("./woorankMiddleware");
const seobserverMiddleware = require("./seobserverMiddleware");
const seozoomMiddleware = require("./seozoomMiddleware");
const explodingtopicsMiddleware = require("./explodingtopicsMiddleware");
const affilistingMiddleware = require("./affilistingMiddleware");
const localrankerMiddleware = require("./localrankerMiddleware");
const copyscapeMiddleware = require("./copyscapeMiddleware");
const ecomhuntMiddleware = require("./ecomhuntMiddleware");
const keywordcupidMiddleware = require("./keywordcupidMiddleware");
const serpstatMiddleware = require("./serpstatMiddleware");
const plagiumMiddleware = require("./plagiumMiddleware");
const closersCopyMiddleware = require("./closersCopyMiddleware");
const linkodyMiddleware = require("./linkodyMiddleware");
const alisharkMiddleware = require("./alisharkMiddleware");
const pexdaMiddleware = require("./pexdaMiddleware");
const zonbaseMiddleware = require("./zonbaseMiddleware");
const analyzonbaseMiddleware = require("./analyzonbaseMiddleware");
const dropshipMiddleware = require("./dropshipMiddleware");
const espinnerMiddleware = require("./espinnerMiddleware");
const asinseedMiddleware = require("./asinseedMiddleware");
const sellerspriteMiddleware = require("./sellerspriteMiddleware");
const kindlerankerMiddleware = require("./kindlerankerMiddleware");
const iconscoutMiddleware = require('./iconscoutMiddleware');
const spinrewriterMiddleware = require('./spinrewriterMiddleware');
const pacdoraMiddleware = require('./pacdoraMiddleware');

const notFoundMiddleware = (req, res, next) => {
    res.status(404);
    const error = new Error(`🔍 - Not Found - ${req.originalUrl}`);
    next(error);
}

const errorHandleMiddleware = (err, req, res, next) => {
    const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
    console.log(err);
    res.status(statusCode);
    res.render("error", { 
        message: err.message,         
        stack: process.env.NODE_ENV === "production" ? "🥞" : err.stack
    });
}

const nextMiddleware = (req, res, next) => {
    next();
}

const semrushLimitMiddleware = async (req, res) => {
    if (!req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
        let { id, username, isAdmin } = req.user;
        let { wpSite } = req;
        if (
            !isAdmin && 
            /\/analytics\/overview\//.test(req.originalUrl)
        ) {
            const total = await domainOverviewModel.countRequests(id, username, wpSite, "semrush");
            const limit = await settingModel.getOverviewLimit("semrushDomainOverviewLimit");
            if (total >= limit) {
                return {
                    next: false,
                    type: "html",
                    data: `<div class="text-center text-danger">Your daily limit is reached.</div>`
                }              
            }
        } else if (
            !isAdmin &&
            /\/dpa\/rpc/.test(req.originalUrl) &&
            typeof req.body == "object" &&
            typeof req.body.params == "object" &&
            req.body.method == "dpa.IsRootDomain" &&
            req.body.params.report == "domain.overview"
        ) {
            await domainOverviewModel.create({
                userId: id,
                username: username,
                site: wpSite,
                proxyType: "semrush",
                domain: req.body.params.args.searchItem
            });
        }
        if (
            !isAdmin &&
            (
                /\/analytics\/keywordoverview\//.test(req.originalUrl) || 
                /\/analytics\/keywordmagic\//.test(req.originalUrl)
            )
        ) {
            const total = await keywordOverviewModel.countRequests(id, username, wpSite, "semrush");
            const limit = await settingModel.getOverviewLimit("semrushKeywordOverviewLimit");
            if (total >= limit) {
                return {
                    next: false,
                    type: "html",
                    data: `<div class="text-center text-danger">Your daily limit is reached.</div>`
                }     
            }
        } else if (
            !isAdmin &&
            req.method.toUpperCase() == "POST" &&
            typeof req.body == "object" &&
            (
                (/\/kwogw\/rpc/.test(req.originalUrl) && req.body.method == "fts.GetKeywords") ||
                (/\/kmtgw\/rpc/.test(req.originalUrl) && req.body.method == "fts.GetKeywords")
            ) && req.body.id == 5
        ) {
            await keywordOverviewModel.create({
                userId: id,
                username: username,
                site: wpSite,
                proxyType: "semrush",
                phases: [req.body.params.phrase]
            });
        }
    }
    return {
        next: true
    }
}

const spyfuLimitMiddleware = async (req, res, next) => {
    if (!req.originalUrl.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
        let { id, username, isAdmin } = req.user;
        let wpSite = req.wpSite;
        if (!isAdmin && (req.path == "/account" || req.path == "/account/subscription")) {
            return {
                next: false,
                redirect: true,
                path: "/"
            }
        }
        if (
            !isAdmin &&
            /\/Endpoints\/Search\/JsonSearch/.test(req.originalUrl) &&
            req.query.isSiteQuery == "true"
        ) {
            const total = await domainOverviewModel.countRequests(id, username, wpSite, "spyfu");
            const limit = await settingModel.getOverviewLimit("spyfuDomainOverviewLimit");
            if (total >= limit) {
                return {
                    next: false,
                    redirect: false,
                    data: {
                        IsSerpBacked: false,
                        ResultType: "Domain",
                        ResultTypeId: 0,
                        Searches: 0,
                        WasQueryFound: false    
                    }
                }
            } else {
                await domainOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "spyfu",
                    domain: req.query.query
                });
            }
        }
        if (
            !isAdmin &&
            /\/Endpoints\/Search\/JsonSearch/.test(req.originalUrl) && 
            req.query.isSiteQuery == "false"
        ) {
            const total = await keywordOverviewModel.countRequests(id, username, wpSite, "spyfu");
            const limit = await settingModel.getOverviewLimit("spyfuKeywordOverviewLimit");
            if (total >= limit) {
                return {
                    next: false,
                    redirect: false,
                    data: {
                        IsSerpBacked: false,
                        ResultType: "Term",
                        ResultTypeId: 0,
                        Searches: 0,
                        WasQueryFound: false    
                    }
                }
            } else {
                await keywordOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "spyfu",
                    phases: [req.query.query]
                });
            }
        }
    }
    return {
        next: true
    }
}

const pipiadsLimitMiddleware = async (req, res, next) => {
    if (!req.originalUrl.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
        let { id, username, isAdmin } = req.user;
        let wpSite = req.wpSite;
        if (
            !isAdmin &&
            req.method == "POST" &&
            /\/api\/at\/video\/search/.test(req.path)
        ) {
            let total = await pipiadsOverviewModel.countRequests(id, username, wpSite, "pipiads", "advertisement");
            let limit = await settingModel.getOverviewLimit("pipiadsAdvertisementOverviewLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: {
                        message: "Search Time",
                        translate: {
                            title: {
                                zh: "可用次数已用完",
                                en: "The number of available times has been used up"
                            }, 
                            content:{
                                zh: `免费版每天可使用${limit}次，当前次数已用完，立即升级会员版本，获得更多次数`,
                                en: `trial can be used ${limit} times a day, the current times have been used up.`
                            },
                            current_level: "Membership"
                        },
                        code: 403
                    }
                }
            } else {
                await pipiadsOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "pipiads",
                    type: "advertisement",
                    phases: JSON.stringify(req.body)
                });
            }
        } else if (
            !isAdmin &&
            req.method == "GET" &&
            /\/api\/product/.test(req.path)
        ) {
            let total = await pipiadsOverviewModel.countRequests(id, username, wpSite, "pipiads", "product");
            let limit = await settingModel.getOverviewLimit("pipiadsProductOverviewLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: {
                        message: "Search Time",
                        translate: {
                            title: {
                                zh: "可用次数已用完",
                                en: "The number of available times has been used up"
                            }, 
                            content:{
                                zh: `免费版每天可使用${limit}次，当前次数已用完，立即升级会员版本，获得更多次数`,
                                en: `trial can be used ${limit} times a day, the current times have been used up.`
                            },
                            current_level: "Membership"
                        },
                        code: 403
                    }
                }
            } else {
                await pipiadsOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "pipiads",
                    type: "product",
                    phases: JSON.stringify(req.query)
                });
            }
        } else if (
            !isAdmin &&
            req.method == "POST" &&
            /\/api\/root_path\/rank\/search/.test(req.path)
        ) {
            let total = await pipiadsOverviewModel.countRequests(id, username, wpSite, "pipiads", "advertiser");
            let limit = await settingModel.getOverviewLimit("pipiadsAdvertiserOverviewLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: {
                        message: "Search Time",
                        translate: {
                            title: {
                                zh: "可用次数已用完",
                                en: "The number of available times has been used up"
                            }, 
                            content:{
                                zh: `免费版每天可使用${limit}次，当前次数已用完，立即升级会员版本，获得更多次数`,
                                en: `trial can be used ${limit} times a day, the current times have been used up.`
                            },
                            current_level: "Membership"
                        },
                        code: 403
                    }
                }
            } else {
                await pipiadsOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "pipiads",
                    type: "advertiser",
                    phases: JSON.stringify(req.body)
                });
            }
        }
    }
    return {
        next: true
    }
}

const keywordkegLimitMiddleware = async (req, res) => {
    if (req.method == "POST" && req.path == "/sf") {
        let { id, username, isAdmin } = req.user;
        if (isAdmin) {
            let wpSite = req.wpSite;
            let total = await keywordOverviewModel.countRequests(id, username, wpSite, "keywordkeg");
            let limit = await settingModel.getOverviewLimit("keywordkegKeywordOverviewLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: {
                        error: true,
                        handled: true
                    }
                }
            } else {
                await keywordOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "keywordkeg",
                    phases: [req.keyword]
                });
            }
        }
    }
    return {
        next: true
    }
}

const colinkriLimitMiddleware = async (req, res) => {
    if (
        req.method === "POST" &&
        /\/amember\/crawler\/campaigns\/new/.test(req.path)
    ) {
        let { id, username, isAdmin } = req.user;
        let wpSite = req.wpSite;
        let total = await keywordOverviewModel.countRequests(id, username, wpSite, "colinkri");
        let limit = await settingModel.getOverviewLimit("conlinkriCampaignLimit");
        if (total >= limit) {
            return {
                next: false,
                data: {
                    message: `You can only add ${limit} campaigns per day.`
                }
            }
        } else {
            await keywordOverviewModel.create({
                userId: id,
                username: username,
                site: wpSite,
                proxyType: "colinkri",
                phases: [req.body.campaignName]
            });
        }
    }
    return {
        next: true
    }
}

const dinorankLimitMiddleware = async (req, res) => {
    if (req.method === "POST" && /^\/ajax\/densidad.php/.test(req.path)) {
        let { id, username, isAdmin } = req.user;
        if (!isAdmin) {
            let wpSite = req.wpSite;
            let total = await keywordOverviewModel.countRequests(id, username, wpSite, "dinorank");
            let limit = await settingModel.getOverviewLimit("dinorankProminenceLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `<h3 class="alert-danger p-4"><strong>Notice!</strong> Unfortunately, you can only use ${limit} times per day for this feature.</h3>`
                }
            } else {
                await keywordOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "dinorank",
                    phases: [req.body.keyword]
                });
            }
        }
    }
    return {
        next: true
    }
}

const ranxplorerLimitMiddleware = async (req, res) => {
    if (!req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
        let { id, username, isAdmin } = req.user;
        let { wpSite } = req;
        if (
            !isAdmin && 
            /\/domaine\/synthese/.test(req.originalUrl)
        ) {
            const total = await domainOverviewModel.countRequests(id, username, wpSite, "ranxplorer");
            const limit = await settingModel.getOverviewLimit("ranxplorerSiteLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your quota of site research. you can search ${limit} times.`
                }               
            } else {
                await domainOverviewModel({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: 'ranxplorer',
                    domain: ""
                });
                return {
                    next: true
                }
            }
        } 
        if (
            !isAdmin &&
            /\/motcle\/supercocon/.test(req.originalUrl)
        ) {
            const total = await keywordOverviewModel.countRequests(id, username, wpSite, "ranxplorer");
            const limit = await settingModel.getOverviewLimit("ranxplorerKeywordLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your quota of keyword research. you can search ${limit} times.`
                }     
            } else {
                await keywordOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "ranxplorer",
                    phases: [""]
                });
                return {
                    next: true
                }
            }
        }

        if (
            !isAdmin &&
            /\/domaine\/exportkeywords/.test(req.originalUrl) ||
            /\/domaine\/exporturls/.test(req.originalUrl) ||
            /\/domaine\/exportdirs/.test(req.originalUrl) ||
            /\/motcle\/exportsupercocon/.test(req.originalUrl)
        ) {
            const total = await exportOverviewModel.countRequests(id, username, wpSite, "ranxplorer");
            const limit = await settingModel.getOverviewLimit("ranxplorerExportLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your quota of export research. you can search ${limit} times.`
                }
            } else {
                await exportOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "ranxplorer",
                    domain: ""
                });
                return {
                    next: true
                }
            }
        }
    }
    return {
        next: true
    }
}

const majesticLimitMiddleware = async (req, res, next) => {
    if (!req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
        let { id, username, isAdmin } = req.user;
        let { wpSite } = req;
        if (!isAdmin && /\/reports\/bulk-backlink-checker/.test(req.path) && req.method == "POST") {
            const total = await domainOverviewModel.countRequests(id, username, wpSite, "majestic");
            const limit = await settingModel.getOverviewLimit("majesticBacklinkLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your limit checking backlinks per day. you can check ${limit} times. `
                }
            } else {
                await domainOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "majestic",
                    domain: req.body.q
                });
                return {
                    next: true
                }
            }
        }
    }
    return {
        next: true
    }
}

const seobserverLimitMiddleware = async (req, res, next) => {
    if (!req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
        let { id, username, isAdmin } = req.user;
        let { wpSite } = req;
        if (!isAdmin && /\/keywords\/directsearch/.test(req.originalUrl) && req.method == "POST") {
            const total = await keywordOverviewModel.countRequests(id, username, wpSite, "seobserver");
            const limit = await settingModel.getOverviewLimit("seobserverKeywordLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your limit keyword search per day. you can check ${limit} times.`
                }
            } else {
                await keywordOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "seobserver",
                    phases: [""]
                });
                return {
                    next: true
                }
            }
        }
        if (!isAdmin && (/\/sites\/view\//.test(req.originalUrl) || /\/sites\/directsearch/.test(req.originalUrl)) && req.method == "POST") {
            const total = await domainOverviewModel.countRequests(id, username, wpSite, "seobserver");
            const limit = await settingModel.getOverviewLimit("seobserverDomainLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your limit domain search per day. you can check ${limit} times.`
                }
            } else {
                await domainOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "seobserver",
                    domain: ""
                });
                return {
                    next: true
                }
            }
        }
        if (!isAdmin && /\/unlock\//.test(req.originalUrl)) {
            const total = await exportOverviewModel.countRequests(id, username, wpSite, "seobserver");
            const limit = await settingModel.getOverviewLimit("seobserverUnlockLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your limit unlocking site per day. you can check ${limit} times.`
                }
            } else {
                await exportOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "seobserver",
                    domain: ""
                });
                return {
                    next: true
                }
            }
        } 
    }

    return {
        next: true
    }
}

const woorankLimitMiddleware = async (req, res, next) => {
    if (!req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
        let { id, username, isAdmin } = req.user;
        let { wpSite } = req;
        if (!isAdmin && /\/api\/review/.test(req.path) && req.method == "POST") {
            const total = await domainOverviewModel.countRequests(id, username, wpSite, "woorank");
            const limit = await settingModel.getOverviewLimit("woorankReviewLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your limit reviewing websites per day. you can review ${limit} times.`
                }
            } else {
                await domainOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "woorank",
                    domain: req.body.url
                });
                return {
                    next: true
                }
            }
        }
    }
    return {
        next: true
    }
}

const copyscapeLimitMiddleware = async (req, res, next) => {
    if (!req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
        let { id, username, isAdmin } = req.user;
        let { wpSite } = req;
        if (!isAdmin && /\/?q=/.test(req.url)) {
            const total = await domainOverviewModel.countRequests(id, username, wpSite, "copyscape", "page");
            const limit = await settingModel.getOverviewLimit("copyscapePageSearchLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your limit page search per day. you can only search ${limit} times a day.`
                }
            } else {
                await domainOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "copyscape",
                    searchType: "page",
                    domain: ""
                });
                return {
                    next: true
                }
            }
        }
        if (!isAdmin && /\/prosearch.php/.test(req.path) && req.method == "POST") {
            const total = await domainOverviewModel.countRequests(id, username, wpSite, "copyscape", "premium");
            const limit = await settingModel.getOverviewLimit("copyscapePremiumSearchLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your limit premium search per day. you can only search ${limit} times a day.`
                }
            } else {
                await domainOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "copyscape",
                    searchType: "premium",
                    domain: ""
                });
                return {
                    next: true
                }
            }
        }
        if (!isAdmin && /\/probatchedit.php/.test(req.path) && req.method == "POST") {
            const total = await domainOverviewModel.countRequests(id, username, wpSite, "copyscape", "batch");
            const limit = await settingModel.getOverviewLimit("copyscapeBatchSearchLimit");
            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your limit batch search per day. you can only search ${limit} times a day.`
                }
            } else {
                await domainOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "copyscape",
                    searchType: "batch",
                    domain: ""
                });
                return {
                    next: true
                }
            }
        }
    }
    return {
        next: true
    }
}

const plagiumLimitMiddleware = async (req, res, next) => {
    if (!req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
        let { id, username, isAdmin } = req.user;
        let { wpSite } = req;
        if (!!isAdmin && /\/ajax\/document\/add/.test(req.path)) {
            let total, limit, type;
            if (req.body.data.obj.data.search.from === "text") {
                total = await domainOverviewModel.countRequests(id, username, wpSite, "plagium", "text");
                limit = await settingModel.getOverviewLimit("plagiumTextLimit");
                type = "text";
            } else if (req.body.data.obj.data.search.from === "url") {
                total = await domainOverviewModel.countRequests(id, username, wpSite, "plagium", "url");
                limit = await settingModel.getOverviewLimit("plagiumUrlLimit");
                type = "url";
            } else if (req.body.data.obj.data.search.from === "file") {
                total = await domainOverviewModel.countRequests(id, username, wpSite, "plagium", "file");
                limit = await settingModel.getOverviewLimit("plagiumFileLimit");
                type = "file";
            }

            await domainOverviewModel.create({
                userId: id,
                username: username,
                site: wpSite,
                proxyType: "plagium",
                searchType: type
            });
        }
    }
    return {
        next: true
    }
}

const yourtextLimitMiddleware = async (req, res, next) => {
    if (!req.url.match(/\.(css|json|js|text|png|jpg|map|ico|svg)/)) {
        let { id, username, isAdmin } = req.user;
        let { wpSite } = req;
        if (isAdmin && /^\/project\/\d+\/group/.test(req.path) && req.method == "POST") {
            const total = await keywordOverviewModel.countRequests(id, username, wpSite, "yourtext");
            const limit = await settingModel.getOverviewLimit("yourtextGroupLimit");

            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your limit creating groups per day. you can check ${limit}`
                }
            } else {
                await keywordOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "yourtext",
                    phases: [""]
                })

                return {
                    next: true
                }
            }
        }

        if (isAdmin && /^\/project/.test(req.path) && req.method == "POST") {
            console.log(id, username, wpSite);
            const total = await domainOverviewModel.countRequests(id, username, wpSite, "yourtext");
            const limit = await settingModel.getOverviewLimit("yourtextProjectLimit");

            if (total >= limit) {
                return {
                    next: false,
                    data: `You have reached your limit creating projects per day. you can check ${limit} times.`
                }
            } else {
                await domainOverviewModel.create({
                    userId: id,
                    username: username,
                    site: wpSite,
                    proxyType: "yourtext",
                    domain: ""
                })

                return {
                    next: true
                }
            }
        }   

    }

    return {
        next: true
    }
}

const applyMiddleware = async (req, res, next) => {
    let domain = req.headers['host'];
    // domain = "guru.oceanserver.link";
    let setting = await settingModel.findOne();
    let proxy = await proxyModel.findOne({domain});
    if (proxy !== null) {
        if (setting != null) {
            let prefix = (typeof req.cookies.prefix == "undefined" || req.cookies.prefix == "") ? "www" : req.cookies.prefix;
            req.proxy = {
                prefix,
                cookie: setting[`${proxy.type}Cookie`]
            }
            if (proxy.type == "semrush") {
                let result = await semrushLimitMiddleware(req, res);
                if (result.next) {
                    return semrushMiddleware(req.proxy.prefix)(req, res, next);
                } else {
                    if (result.type == "json") {
                        return res.json(result.data);
                    } else {
                        return res.send(result.data);
                    }
                }
            } else if (proxy.type == "static.semrush") {
                return staticSemrushMiddleware(prefix)(req, res);
            } else if (proxy.type == "spyfu") {
                let result = await spyfuLimitMiddleware(req, res);
                if (result.next) {
                    return spyfuMiddleware(prefix)(req, res, next);
                } else {
                    if (result.redirect) {
                        return res.status(301).redirect(result.path);
                    } else {
                        return res.json(result.data);
                    }
                }
            } else if (proxy.type == "seolyze") {
                return seolyzeMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "sistrix") {
                sistrixMiddleware(req, res, next);
            } else if (proxy.type == "linkcentaur") {
                return linkcentaurMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "spamzilla") {
                return spamzillaMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "seodity") {
                if (req.proxy.cookie) {
                    res.cookie("jwt-token", req.proxy.cookie, {
                        path: "/",
                        domain: process.env.NODE_ENV === "development" ? undefined : domain
                    });
                }
                return seodityMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "rytrme") {
                return rytrmeMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "wordai") {
                return wordaiMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "keywordrevealer") {
                return keywordMiddleware(req, res, next);
            } else if (proxy.type == "nichescraper") {
                return nichescraperMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "pipiads") {
                let result = await pipiadsLimitMiddleware(req, res);
                if (result.next) {
                    return pipiadsMiddleware(prefix)(req, res, next);
                } else {
                    return res.status(403).json(result.data);
                }
            } else if (proxy.type == "keywordkeg") {
                let result = await keywordkegLimitMiddleware(req, res);
                if (result.next) {
                    return keywordkegMiddleware(prefix)(req, res, next);
                } else {
                    return res.json(result.data);
                }
            } else if (proxy.type == "paraphraser") {
                return paraphraserMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "buzzsumo") {
                return buzzsumoMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "articleforge") {
                return articleforgeMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "bigspy") {
                return bigspyMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "colinkri") {
                let result = await colinkriLimitMiddleware(req, res);
                if (result.next) {
                    return colinkriMiddleware(prefix)(req, res, next);
                } else {
                    return res.render("warning", { msg: result.data.message });
                }
            } else if (proxy.type == "dinorank") {
                let result = await dinorankLimitMiddleware(req, res, next);
                if (result.next) {
                    return dinorankMiddleware(prefix)(req, res, next);
                } else {
                    return res.json(result.data);
                }
            } else if (proxy.type == "yourtext") {
                let result = await yourtextLimitMiddleware(req, res, next);
                if (result.next) {
                    return yourtextMiddleware(prefix)(req, res, next);
                } else {
                    res.status(500).json({message: result.data});
                }
            } else if (proxy.type === "babbar") {
                return babbarMiddleware(prefix)(req, res, next);
            } else if (proxy.type === "firstfr") {
                return firstfrMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "textoptimizer") {
                return textoptimizerMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "onehourindexing") {
                return onehourindexingMiddleware(prefix)(req, res, next);
            } else if (proxy.type == "ranxplorer") {
                let result = await ranxplorerLimitMiddleware(req, res);
                if (result.next) {
                    return ranxplorerMiddleware(prefix)(req, res, next);
                } else {
                    res.render("warning", {msg: result.data});
                }
            } else if (proxy.type == "majestic") {
                let result = await majesticLimitMiddleware(req, res, next);
                if (result.next) {
                    return majesticMiddleware(prefix)(req, res);
                } else {
                    res.render("warning", {msg: result.data});
                }
            } else if (proxy.type == "woorank") {
                let result = await woorankLimitMiddleware(req, res, next);
                if (result.next) {
                    return woorankMiddleware(prefix)(req, res);
                } else {
                    return res.json(result.data);
                }
            } else if (proxy.type == "seobserver") {
                let result = await seobserverLimitMiddleware(req, res, next);
                if (result.next) {
                    return seobserverMiddleware(prefix)(req, res);
                } else {
                    return res.render("warning", {msg: result.data});
                }
            } else if (proxy.type == "seozoom") {
                return seozoomMiddleware(prefix)(req, res);
            } else if (proxy.type == "affilisting") {
                return affilistingMiddleware(prefix)(req, res);
            } else if (proxy.type == "explodingtopics") {
                return explodingtopicsMiddleware(prefix)(req, res);
            } else if (proxy.type == "localranker") {
                return localrankerMiddleware(prefix)(req, res);
            } else if (proxy.type == "copyscape") {
                let result = await copyscapeLimitMiddleware(req, res, next);
                if (result.next) {
                    return copyscapeMiddleware(prefix)(req, res);
                } else {
                    return res.render("warning", {msg: result.data});
                }
            } else if (proxy.type == "ecomhunt") {
                return ecomhuntMiddleware(prefix)(req, res);
            } else if (proxy.type == "keywordcupid") {
                return keywordcupidMiddleware(prefix)(req, res);
            } else if (proxy.type === "serpstat") {
                return serpstatMiddleware(prefix)(req, res);
            } else if (proxy.type === "plagium") {
                let result = await plagiumLimitMiddleware(req, res, next);
                if (result.next) {
                    return plagiumMiddleware(prefix)(req, res);
                }
            } else if (proxy.type === "closerscopy") {
                return closersCopyMiddleware(prefix)(req, res);
            } else if (proxy.type === "linkody") {
                return linkodyMiddleware(prefix)(req, res);
            } else if (proxy.type === "alishark") {
                return alisharkMiddleware(prefix)(req, res);
            } else if (proxy.type === "pexda") {
                return pexdaMiddleware(prefix)(req, res);
            } else if (proxy.type === "zonbase") {
                return zonbaseMiddleware(prefix)(req, res);
            } else if (proxy.type === "analyzonbase") {
                return analyzonbaseMiddleware(prefix)(req, res);
            } else if (proxy.type === "dropship") {
                return dropshipMiddleware(prefix)(req, res);
            } else if (proxy.type === 'espinner') {
                return espinnerMiddleware(prefix)(req, res);
            } else if (proxy.type === 'asinseed') {
                return asinseedMiddleware(prefix)(req, res);
            } else if (proxy.type === 'sellersprite') {
                return sellerspriteMiddleware(prefix)(req, res);
            } else if (proxy.type === 'kindleranker') {
                return kindlerankerMiddleware(prefix)(req, res);
            } else if (proxy.type === 'iconscout') {
                return iconscoutMiddleware(prefix)(req, res);
            } else if (proxy.type === 'spinrewriter') {
                return spinrewriterMiddleware(prefix)(req, res);
            } else if (proxy.type === 'pacdora') {
                return pacdoraMiddleware(prefix)(req,res);
            }
        } else {
            return res.render("warning", { msg: "Admin have to set up some proxy-related setting."});
        }
    } else {
        return res.render("warning", {msg: "The domain is not registered in our application."});
    }
}

module.exports = {
    notFoundMiddleware,
    errorHandleMiddleware,
    authMiddleware,
    memberMiddleware,
    jsonMiddleware,
    nextMiddleware,
    mcopMiddleware,
    spyfuMiddleware,
    applyMiddleware
}