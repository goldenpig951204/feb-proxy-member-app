const fs = require("fs");
const fsPromises = require("fs").promises;
const crypto = require("node:crypto");
const base64 = require("base-64");
const axios = require("axios");
const https = require("https");
const dvAxios = require("devergroup-request").default;
const http = new dvAxios({
  axiosOpt: {
    timeout: 30000,
  },
});
const zlib = require("zlib");
const puppeteer = require("puppeteer-extra");
const recaptchaPlugin = require("@nsourov/puppeteer-extra-plugin-recaptcha");
const stealthPlugin = require("puppeteer-extra-plugin-stealth");
const captcha = require("2captcha");
const parseHTML = require("jquery-html-parser");
const siteModel = require("../models/site");
const settingModel = require("../models/setting");

const decodeSess = (sess) => {
  let [signature, timeBase64, dataBase64] = sess.split("#");
  let timeBuffer = Buffer.from(timeBase64, "base64");
  let dataBuffer = Buffer.from(dataBase64, "base64");
  let data = JSON.parse(base64.decode(dataBase64));
  return {
    signature,
    timeBuffer,
    dataBuffer,
    data,
  };
};
const sign = (timeSignedBuffer, dataBuffer, userAgent, ipAddr) => {
  const signature = crypto
    .createHmac("sha1", process.env.PRIVATE_KEY)
    .update(`${userAgent}\n${ipAddr}`)
    .update(timeSignedBuffer)
    .update(dataBuffer)
    .digest("base64");
  return signature;
};
const isValidSess = (sess, userAgent, ipAddr) => {
  let { timeBuffer, dataBuffer, signature } = decodeSess(sess);
  let signedResult = sign(timeBuffer, dataBuffer, userAgent, ipAddr);
  return signedResult === signature;
};
const getMainDomain = (subDomain) => {
  let segments = subDomain.split(".");
  let domain = "";
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      domain += `.${segments[i]}`;
    }
  }
  return domain;
};
const getFormQueryStr = (data) => {
  let items = [];
  Object.keys(data).forEach((key, idx) => {
    if (Array.isArray(data[key])) {
      for (let item of data[key]) {
        items.push(key + "[]" + "=" + encodeURIComponent(item));
      }
    } else if (typeof data[key] == "object") {
      for (let subKey in data[key]) {
        items.push(
          key + "[" + subKey + "]" + "=" + encodeURIComponent(data[key][subKey])
        );
      }
    } else {
      items.push(key + "=" + encodeURIComponent(data[key]));
    }
  });
  let dataQuery = items.join("&");
  return dataQuery;
};
const singleJsonUrlEncoded = (data) => {
  let items = [];
  Object.keys(data).forEach((key, idx) => {
    if (key == "auto_link_data") {
      items.push(key + "=" + encodeURIComponent(data[key][1]));
    } else {
      items.push(key + "=" + encodeURIComponent(data[key]));
    }
  });
  let dataQuery = items.join("&");
  return dataQuery;
};
const JSON_to_URLEncoded = (element, key, list) => {
  var list = list || [];
  if (typeof element == "object") {
    if (Array.isArray(element)) {
      for (var idx in element) {
        JSON_to_URLEncoded(element[idx], key ? key + "[]" : idx, list);
      }
    } else {
      for (var idx in element) {
        JSON_to_URLEncoded(
          element[idx],
          key ? key + "[" + idx + "]" : idx,
          list
        );
      }
    }
  } else {
    list.push(key + "=" + encodeURIComponent(element));
  }
  return list.join("&");
};
const jsonAryUrlEncoded = (element, key, list) => {
  var list = list || [];
  if (typeof element == "object") {
    for (var idx in element) {
      jsonAryUrlEncoded(element[idx], key ? key + "[" + idx + "]" : idx, list);
    }
  } else {
    list.push(key + "=" + encodeURIComponent(element));
  }
  return list.join("&");
};
const genSess = (dataBuffer, userAgent, ipAddr) => {
  let now = new Date().getTime();
  let timeSignedBuffer = Buffer.alloc(4);
  timeSignedBuffer.writeInt32LE(parseInt(now / 1000), 0);
  let signature = sign(timeSignedBuffer, dataBuffer, userAgent, ipAddr);
  return `${signature}#${timeSignedBuffer.toString(
    "base64"
  )}#${dataBuffer.toString("base64")}`;
};
const getMembership = async (uid, lid, siteUrl) => {
  try {
    let site = await siteModel.findOne({ url: siteUrl });
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });
    let { data } = await axios.get(
      `${siteUrl}/wp-content/plugins/indeed-membership-pro/apigate.php?ihch=${site.membershipApiKey}&action=verify_user_level&uid=${uid}&lid=${lid}`,
      {
        httpsAgent: agent,
      }
    );
    
    return data.response;
  } catch (err) {
    return false;
  }
};
const isAccessable = async (uid, site) => {
  let setting = await settingModel.findOne();
  let check = false;
  for (let i = 0; i < setting.membershipLids.length; i++) {
    let lid = setting.membershipLids[i];
    let result = await getMembership(uid, lid, site);
    if (result != 0) {
      check = true;
      break;
    }
  }
  return check;
};
const isStaticRes = async (url) => {
  return (url + "").match(
    /\.(css|text|png|jpg|map|ico|svg|mp3|mp4|txt|jfproj|etx|pfa|fnt|vlw|woff|fot|ttf|sfd|pfb|vfb|otf|gxf|odttf|woff2|pf2|bf|ttc|chr|bdf|fon)/i
  );
};
const randomUserAgent = async (id) => {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.5005.63 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246",
    "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:56.0) Gecko/20100101 Firefox/56.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:57.0) Gecko/20100101 Firefox/57.0",
  ];
  if (typeof id === "number" && Number.isInteger(id)) {
    return userAgents[id];
  }

  const index = Math.floor(Math.random() * Math.floor(4));
  return userAgents[index];
};
const decompressData = (compressedData, decompressStream, resolve, reject) => {
  let buffer = Buffer.from("", "utf8");

  decompressStream.write(compressedData);
  decompressStream.end();

  decompressStream.on("data", function (chunk) {
    buffer = Buffer.concat([buffer, chunk]);
  });

  decompressStream.on("end", function () {
    resolve(buffer);
  });

  decompressStream.on("error", function (error) {
    reject(error);
  });
};
const unzip = (bufferedData, options = {}) => {
  return new Promise((resolve, reject) => {
    decompressData(bufferedData, zlib.createUnzip(), resolve, reject);
  });
};
const inflate = (
  bufferedData,
  options = { flush: zlib.constants.Z_PARTIAL_FLUSH }
) => {
  return new Promise((resolve, reject) => {
    decompressData(bufferedData, zlib.createInflate(), resolve, reject);
  });
};
const brotliDecompress = (bufferedData, options = {}) => {
  return new Promise((resolve, reject) => {
    decompressData(
      bufferedData,
      zlib.createBrotliDecompress(),
      resolve,
      reject
    );
  });
};
const writeFile = async (filePath, data) => {
  let result = "";
  let mainError = null;
  let fileHandle;

  if (fs.existsSync(filePath)) {
    try {
      fileHandle = await fsPromises
        .open(filePath, "w+")
        .catch(async (oError) => {
          mainError = oError;
        });

      await fileHandle.writeFile(data).catch(async (wError) => {
        mainError = wError;
      });
    } catch (error) {
      mainError = error;
    } finally {
      if (fileHandle !== undefined) await fileHandle.close();
    }
  } else {
    await fsPromises.appendFile(filePath, data).catch((wError) => {
      mainError = wError;
    });
  }

  if (mainError !== null) throw mainError;

  return result;
};
const spamzillaAutoLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    puppeteer.use(stealthPlugin());
    puppeteer.use(
      recaptchaPlugin({
        provider: {
          id: "2captcha",
          token: process.env.TWO_CAPTCHA_KEY,
        },
        visualFeedback: true,
      })
    );

    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://www.spamzilla.io/account/login/", {
      waitUntil: "load",
      timeout: 100000,
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    await page.focus("#loginform-email").then(async () => {
      await page.keyboard.type(email, { delay: 200 });
    });
    await page.focus("#loginform-password").then(async () => {
      await page.keyboard.type(password, { delay: 200 });
    });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
      page.click(".custom-submit-btn"),
    ]).then(async (result) => {
      if (/account\/login/.test(page.url())) {
        await browser.close(true);
        resolve(false);
      } else {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }

        await settingModel.findOneAndUpdate(
          null,
          {
            spamzillaCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      }
    });
  });
};
const spyfuAutoLogin = async (username, password) => {
  return new Promise(async (resolve, reject) => {
    let body = {
      username,
      password,
      rememberMe: false,
      source: "LoginPage",
      token:
        "03AIIukzg2cJaTcrMEK4tXZrjb18q3XdxrJ30OdPe5m5tnh9dsJN4ksSqqLbWEiuHI1w5_cZ8lHEM2ZU0MYwPPmEaFp",
    };
    let { data } = await http.instance.post(
      "https://www.spyfu.com/auth/login",
      JSON.stringify(body),
      {
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json; charset=UTF-8",
          "content-length": Buffer.from(JSON.stringify(body), "utf-8"),
        },
      }
    );
    if (data.isSuccessful) {
      if (data.clientState.user.isLoggedIn) {
        let cookie = http.cookieJar.getCookieStringSync(
          "https://www.spyfu.com"
        );
        await settingModel.findOneAndUpdate(
          null,
          {
            spyfuCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        return resolve(false);
      }
    } else {
      return resolve(false);
    }
  });
};
const yourtextAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://yourtext.guru/login/", {
      waitUntil: "load",
      timeout: 100000,
    });
    await page.focus("#email").then(async () => {
      await page.keyboard.type(email, { deplay: 100 });
    });
    await page.focus("#password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
      page.evaluate(() =>
        document.querySelector("input[type='submit']").click()
      ),
    ]).then(async (result) => {
      if (!/\/login/.test(page.url())) {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            yourtextCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};
const colinkriAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    console.log(email, password);
    let response = await http.instance.get(
      "https://www.colinkri.com/amember/login"
    );
    let $ = parseHTML(response.data);
    let login_attempt_id = $("[name='login_attempt_id']").val();
    let amember_redirect_url = $("[name='amember_redirect_url']").val();
    let siteKey = "6LcewbwUAAAAAPoM6VrEtPisdEctvKF1FVRHd9Iv";
    let solver = new captcha.Solver(process.env.TWO_CAPTCHA_KEY);
    let { data } = await solver.recaptcha(
      siteKey,
      "https://www.colinkri.com/amember/login"
    );
    let body = `g-recaptcha-response=${data}&amember_login=${email}&amember_pass=${password}&login_attempt_id=${login_attempt_id}&amember_redirect_url=${amember_redirect_url}`;
    response = await http.instance.post(
      "https://www.colinkri.com/amember/login",
      body,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36",
          "content-type": "application/x-www-form-urlencoded",
          "content-length": Buffer.byteLength(body),
        },
      }
    );
    if (response.data && response.data.ok) {
      let cookie = http.cookieJar.getCookieStringSync(
        "https://www.colinkri.com/amember/crawler"
      );
      await settingModel.findOneAndUpdate(
        null,
        {
          colinkriCookie: cookie,
        },
        {
          upsert: true,
        }
      );
      resolve(true);
    } else {
      reject(false);
    }
  });
};
const babbarAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://www.babbar.tech/login", {
      waitUntil: "load",
      timeout: 100000,
    });
    await page.focus("[name='email']").then(async () => {
      await page.keyboard.type(email, { deplay: 100 });
    });
    await page.focus("[name='password']").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await page.click("#customControlInline");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
      page.evaluate(() =>
        document.querySelector("button[type='submit']").click()
      ),
    ]).then(async (result) => {
      if (/\/dashboard/.test(page.url())) {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            babbarCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};

const dinorankAuthLogin = (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://dinorank.com/en/login/", {
      waitUntil: "load",
      timeout: 100000,
    });
    await page.focus("#usuario").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("#password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await page.click("#permanecer");

    await Promise.all([
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
      page.click("#botonLogin"),
    ]).then(async (result) => {
      if (/\/homed\//.test(page.url())) {
        const cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            dinorankCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true)
      } else {
        await browser.close(true);
        resolve(false)
      }
    });
  });
};

const firstfrAuthLogin = (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://1.fr/signin");
    await page.focus("#user_email").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("#user_password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("input[type='submit'"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://1.fr/o") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            textoptimizerCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};
const textoptimizerAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://textoptimizer.com/signin");
    const element = await page.$("#cookiescript_accept");
    if (element !== null) {
      await page.click("#cookiescript_accept");
    }
    await page.goto("https://textoptimizer.com/signin");
    await page.focus("#user_email").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("#user_password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("input[type='submit'"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://textoptimizer.com/o") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            textoptimizerCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};
const linkcentaurAuthLogin = (email, password) => {
  return new Promise(async (resolve, reject) => {
    let response = await axios.instance.get(
      "https://www.linkcentaur.com/users/sign_in"
    );
    let $ = parseHTML(response.data);
    let utf8 = $("#new_user [name='utf8']").val();
    let authenticity_token = $("#new_user [name='authenticity_token']").val();
    let commit = "Sign in";
    let body = JSON.stringify({
      utf8,
      authenticity_token,
      commit,
      user: {
        email,
        password,
        remember_me: 0,
      },
    });
    response = await axios.instance.post(
      "https://www.linkcentaur.com/users/sign_in",
      body,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36",
          "Content-Type": "application/json; charset=UTF-8",
          "Content-Length": Buffer.from(body, "utf-8"),
          Origin: "https://www.linkcentaur.com",
        },
      }
    );
    if (response.request.path == "/") {
      let cookie = axios.cookieJar.getCookieStringSync(
        "https://www.linkcentaur.com"
      );
      await settingModel.findOneAndUpdate(
        null,
        {
          linkcentaurCookie: cookie,
        },
        {
          upsert: true,
        }
      );
      resolve(true);
    } else {
      resolve(false);
    }
  });
};
const onehourindexingAuthLogin = (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://onehourindexing.co/account/login");
    await page.focus("#emailaddress").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("#password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button[type='submit'"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://onehourindexing.co/account") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            onehourindexingCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};
const ranxplorerAuthLogin = (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://ranxplorer.com/login");
    await page.focus("#log").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("#password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button[type='submit'"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://ranxplorer.com/user/dashboard") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            ranxplorerCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const woorankAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    try {
      let siteKey = "6LfZji4hAAAAAPLOsr8TFnm-VuwMbf3jgLJgHFcX";
      let solver = new captcha.Solver(process.env.TWO_CAPTCHA_KEY);
      let response = await solver.recaptcha(
        siteKey,
        "https://www.woorank.com/en/login"
      );
      let body = JSON.stringify({
        email,
        password,
        "g-recaptcha-response": response.data,
      });
      let { data } = await http.instance.post(
        "https://www.woorank.com/api/user/login",
        body,
        {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
            accept: "application/json, text/plain, */*",
            "content-type": "application/json",
            "content-length": Buffer.from(body, "utf-8"),
          },
        }
      );
      if (data.status) {
        let cookie = http.cookieJar.getCookieStringSync(
          "https://www.woorank.com/en/overview"
        );
        await settingModel.findOneAndUpdate(
          null,
          {
            woorankCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        resolve(false);
      }
    } catch (err) {
      resolve(false);
    }
  });
};

const seolyzeAuthLogin = async (username, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://seolyze.com/en");
    await page.click(".navbar-toggle");
    await page.click(".navlogin > a");
    await page.waitForSelector("#login.modal");
    await page.focus("#username").then(async () => {
      await page.keyboard.type(username, { delay: 100 });
    });
    await page.focus("#password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await page.click("#stay_logged");

    await Promise.all([
      page.click("button#regButton"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() == "https://www.seolyze.com/en/EPS-KF/") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            seolyzeCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};
const seobserverAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://app.seobserver.com/login");
    await page.focus("#UserEmail").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("#UserPassword").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://app.seobserver.com/") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            seobserverCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};
const seozoomAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://sz2020.seozoom.it/login");
    await page.focus("#login-email").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("#login-password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button#login-submit"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://sz2020.seozoom.it/") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }

        await settingModel.findOneAndUpdate(
          null,
          {
            seozoomCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};
const buzzsumoAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://app.buzzsumo.com/login");

    const element = await page.$("#consent-manager button:nth-child(2)");
    if (element !== null) {
      await page.click("#consent-manager button:nth-child(2)");
    }
    await page.focus("input[name='email']").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input[name='password']").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      await page.waitForTimeout(3000);
      if (page.url() !== "https://app.buzzsumo.com/login") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }

        await settingModel.findOneAndUpdate(
          null,
          {
            buzzsumoCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const copyscapeAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 300000,
      };
    } else {
      options = {
        headless: false,
        timeout: 300000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://www.copyscape.com/login.php", { timeout: 300000 });
    await page.focus("input[name='login_username']").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input[name='login_password']").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await page.evaluate(() => {
      document.querySelector("#remember").click();
    });
    await Promise.all([
      page.click("input[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 300000 }),
    ]).then(async (result) => {
      let data = await page.$$eval(".error", (notes) => {
        return notes;
      });
      if (!data.length) {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            copyscapeCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};
const sellthetrendAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://www.sellthetrend.com/login", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#email");
    await page.focus("#email").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.waitForSelector("#password");
    await page.focus("#password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await page.evaluate(() => {
      console.log(document.querySelector("#recaptcha_token").value);
    });
    await Promise.all([
      page.click("button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (
        page.url() == "https://www.sellthetrend.com/dashboard/learn/onboarding"
      ) {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }

        await settingModel.findOneAndUpdate(
          null,
          {
            sellthetrendCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};
const mangoolsAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 300000,
      };
    } else {
      options = {
        headless: false,
        timeout: 300000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://mangools.com/users/sign_in", { timeout: 300000 });
    await page.waitForSelector("input#user_email");
    await page.focus("input#user_email").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.waitForSelector("input#user_password");
    await page.focus("input#user_password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 300000 }),
    ]).then(async (result) => {
      if (page.url() === "https://mangools.com/apps") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }

        await settingModel.findOneAndUpdate(
          null,
          {
            mangoolsCookie: cookie,
          },
          {
            upsert: true,
          }
        );

        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};
const keywordcupidAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://keywordcupid.com/accounts/login/");
    await page.focus("#id_username").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("#id_password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://keywordcupid.com/app/project/latest/") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }

        await settingModel.findOneAndUpdate(
          null,
          {
            keywordcupidCookie: cookie,
          },
          {
            upsert: true,
          }
        );

        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const serpstatAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://serpstat.com/login/");
    await page.focus("input[type='text']").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input[type='password']").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://serpstat.com/projects/dashboard/") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            serpstatCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const plagiumAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://premium.plagium.com/en/login");
    await page.focus("input#login_username").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input#login_password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://premium.plagium.com/admin/en/home") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            plagiumCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const closerscopyAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://www.closerscopy.com/signin");
    await page.click("button.highlighted");
    await page.focus("input#email").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input#password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://www.closerscopy.com/dashboard") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            closerscopyCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const linkodyAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://www.linkody.com/en/login");

    await page.focus("input#username").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input#f_password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("input#login-btn"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      console.log(page.url());
      if (page.url() === "https://www.linkody.com/en/domains") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            linkodyCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(false);
      } else {
        resolve(false);
      }
    });
  });
};
const alisharkAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(100000);
    await page.goto("https://alishark.com/login");

    await page.focus("input#firstshit").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input#secondshit").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("form button"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://alishark.com/") {
        const cookies = await page.cookies();
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await browser.close(true);
        await settingModel.findOneAndUpdate(
          null,
          {
            alisharkCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const pexdaAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(100000);
    await page.goto("https://www.pexda.com/account/");

    await page.focus("input#user_login").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input#user_pass").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("input#wp-submit"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://pexda.com/account/") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }

        await settingModel.findOneAndUpdate(
          null,
          {
            pexdaCookie: cookie,
          },
          {
            upsert: true,
          }
        );

        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const zonbaseAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }

    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(100000);
    await page.goto("https://www.zonbase.com/login");

    await page.focus("input#email").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input#password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() === "https://www.zonbase.com/dashboard") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            zonbaseCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const espinnerAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("http://espinner.net/miembros/login");

    await page.focus("input#login").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input#pass").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("form[name='login'] input[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (!/\/miembros\/login/.test(page.url())) {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            espinnerCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const asinseedAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(100000);
    await page.goto("https://www.asinseed.com/en/signin");

    await page.focus("input[name='email']").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input[type='password']").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (
        page.url() === "https://www.asinseed.com/signin" ||
        page.url() === "https://www.asinseed.com/en" ||
        page.url() === "https://www.asinseed.com/cn"
      ) {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }

        await settingModel.findOneAndUpdate(
          null,
          {
            asinseedCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const sellerspriteAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const _password = crypto.createHash("md5").update(password).digest("hex");
    const salt = crypto
      .createHash("md5")
      .update(`${email}${_password}`)
      .digest("hex");
    const body = `callback=&password=${_password}&email=${email}&password_otn=${password}&salt=${salt}`;
    const response = await http.instance.post(
      "https://www.sellersprite.com/w/user/signin",
      body,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.from(body, "utf-8"),
          Host: "www.sellersprite.com",
          Referer: "https://www.sellersprite.com/w/user/signin",
        },
      }
    );
    $ = parseHTML(response.data);
    if ($("title").text() != "Sign In SellerSprite.com") {
      let cookie = http.cookieJar.getCookieStringSync(
        "https://www.sellersprite.com/v2/welcome"
      );
      await settingModel.findOneAndUpdate(
        null,
        {
          sellerspriteCookie: cookie,
        },
        {
          upsert: true,
        }
      );
      resolve(true);
    } else {
      resolve(false);
    }
  });
};
const kindlerankerAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(100000);
    await page.goto("https://www.kindleranker.com");
    await page.click("a#signup");
    await page.waitForSelector("#exampleModal", { visible: true });
    await page.focus("input#login").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus("input#password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await Promise.all([
      page.click("form#form-login button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      const element = await page.$("a[href='/signoff/']");
      if (element !== null) {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }

        await settingModel.findOneAndUpdate(
          null,
          {
            kindlerankerCookie: cookie,
          },
          {
            upsert: true,
          }
        );

        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};
const iconscoutAutoLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    puppeteer.use(stealthPlugin());
    puppeteer.use(
      recaptchaPlugin({
        provider: {
          id: "2captcha",
          token: process.env.TWO_CAPTCHA_KEY,
        },
        visualFeedback: true,
      })
    );

    const defaultTimeout = 300000;

    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }

    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: defaultTimeout,
      };
    } else {
      options = {
        headless: false,
        timeout: defaultTimeout,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }

    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
    );
    await page.goto("https://iconscout.com/", {
      waitUntil: "load",
      timeout: defaultTimeout,
    });
    await page.waitForSelector(
      "#mainMasterHeader > header > nav > ul > li:nth-child(6) > button"
    );
    await page.click(
      "#mainMasterHeader > header > nav > ul > li:nth-child(6) > button"
    );
    await page.waitForSelector("#modalAuthLogin", { visible: true });
    await page.focus('input[name="email"]').then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });
    await page.focus('input[name="password"]').then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });
    await page.click('#modalAuthLogin button[type="submit"]');
    await page.keyboard.press("Enter");
    await page
      .waitForNavigation({ waitUntil: "load", timeout: defaultTimeout })
      .then(async (result) => {
        if ("https://iconscout.com/" === page.url()) {
          const cookies = await page.cookies();
          await browser.close(true);
          let cookie = "";
          for (let idx in cookies) {
            cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
          }

          await settingModel.findOneAndUpdate(
            null,
            {
              iconscoutCookie: cookie,
            },
            {
              upsert: true,
            }
          );
          resolve(true);
        } else {
          resolve(false);
        }
      });
  });
};

const spinrewriterAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://www.spinrewriter.com/log-in", { timeout: 100000 });
    await page.focus("#input-login-email").then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });

    await page.focus("#input-login-password").then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });

    await Promise.all([
      page.click("button[type='submit']"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      if (page.url() == "https://www.spinrewriter.com/cp-home") {
        let cookies = await page.cookies();
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            spinrewriterCookie: cookie,
          },
          {
            upsert: true,
          }
        );

        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};

const pacdoraAuthLogin = async (email, password) => {
  return new Promise(async (resolve, reject) => {
    const windowsLikePathRegExp = /[a-z]:\\/i;
    let inProduction = false;

    if (!windowsLikePathRegExp.test(__dirname)) {
      inProduction = true;
    }
    let options = {};
    if (inProduction) {
      options = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--media-cache-size=0",
          "--disk-cache-size=0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
        timeout: 100000,
      };
    } else {
      options = {
        headless: false,
        timeout: 100000,
        args: [
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
        ],
      };
    }
    const browser = await puppeteer.launch(options);
    const page = await browser.newPage();
    await page.goto("https://www.pacdora.com/login", { timeout: 100000 });
    await page.focus('input[type="text"]').then(async () => {
      await page.keyboard.type(email, { delay: 100 });
    });

    await page.focus('input[type="password"]').then(async () => {
      await page.keyboard.type(password, { delay: 100 });
    });

    await Promise.all([
      page.click("button.pacdoraSignIn"),
      page.waitForNavigation({ waitUntil: "load", timeout: 100000 }),
    ]).then(async (result) => {
      console.log(page.url());
      if (page.url() == "https://www.pacdora.com/") {
        let cookies = await page.cookies();
        console.log("COOKIES======>", cookies);
        await browser.close(true);
        let cookie = "";
        for (let idx in cookies) {
          cookie += cookies[idx].name + "=" + cookies[idx].value + "; ";
        }
        await settingModel.findOneAndUpdate(
          null,
          {
            pacdoraCookie: cookie,
          },
          {
            upsert: true,
          }
        );
        resolve(true);
      } else {
        await browser.close(true);
        resolve(false);
      }
    });
  });
};

module.exports = {
  decodeSess,
  isValidSess,
  genSess,
  isAccessable,
  getMainDomain,
  getFormQueryStr,
  singleJsonUrlEncoded,
  JSON_to_URLEncoded,
  jsonAryUrlEncoded,
  isStaticRes,
  randomUserAgent,
  unzip,
  inflate,
  brotliDecompress,
  writeFile,
  linkcentaurAuthLogin,
  spamzillaAutoLogin,
  spyfuAutoLogin,
  yourtextAuthLogin,
  colinkriAuthLogin,
  babbarAuthLogin,
  dinorankAuthLogin,
  firstfrAuthLogin,
  textoptimizerAuthLogin,
  onehourindexingAuthLogin,
  ranxplorerAuthLogin,
  woorankAuthLogin,
  seolyzeAuthLogin,
  seobserverAuthLogin,
  seozoomAuthLogin,
  buzzsumoAuthLogin,
  copyscapeAuthLogin,
  sellthetrendAuthLogin,
  mangoolsAuthLogin,
  keywordcupidAuthLogin,
  serpstatAuthLogin,
  plagiumAuthLogin,
  closerscopyAuthLogin,
  linkodyAuthLogin,
  alisharkAuthLogin,
  pexdaAuthLogin,
  zonbaseAuthLogin,
  espinnerAuthLogin,
  asinseedAuthLogin,
  sellerspriteAuthLogin,
  kindlerankerAuthLogin,
  iconscoutAutoLogin,
  spinrewriterAuthLogin,
  pacdoraAuthLogin,
};
