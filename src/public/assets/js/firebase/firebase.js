(function () {
    async function fIsDenyNotifications() {
        // 注册监听程序
        navigator.serviceWorker.register('/firebase-messaging-sw.js');

        const status = await navigator.permissions.query({name: 'notifications'});
        const deny = status.state === 'denied';
        if (deny) console.warn('You deny any notifications from us. Sorry to hear that.');
        return deny;
    }
    function fGetSW() {
        return navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    }
    window.addEventListener('load', () => fIsDenyNotifications());
    async function fDisplayMessages(payload) {
        console.log('X: Message received. ', payload);
        // 保证消息只展示一次
        const id = payload['data'] && payload['data']['id'] || ('fb-' + new Date().getTime());
        const sent = payload['data'] && payload['data']['sent_timestamp'] || '';
        // ...这里需要调用前端的代码把相应的信息打印出来todo 悬浮弹窗提示
        try {window.createBrowsermessage(payload);}catch (e) {};

        // Customize notification here
        const title = (payload['notification'] && payload['notification']['title']
            || payload['data'] && payload['data']['title'] || '您有新的消息');
        let link = payload['data'] && payload['data']['callback_link'] || '/?source=firebase_front';
        const options = {
            body: payload['notification'] && payload['notification']['body'] || '(来自卖家精灵) ...',
            icon: '/assets/img/sellersprite-log.png',
            data: {link: link}
        };

        const sw = await fGetSW();
        if (localStorage.getItem(id)) return false;
        let millis = Math.ceil(Math.random() * 1000);
        let v = new Date().getTime() + '-' + millis;
        setTimeout(function () {
            if (localStorage.getItem(id)) return false;
            localStorage.setItem(id, v);
            if (localStorage.getItem(id) !== v) return false;
            sw.showNotification(title, options);
        }, millis);
    }

    const FIREBASE_ITEM_KEY = 'firebase-instance-id-token-v2',
        FIREBASE_ITEM_LAST_KEY = 'firebase-instance-id-token-v2-last',
        FIREBASE_TOKE_ADD_URL = '/',
        HOST = window.location.host,
        FIREBASE_SERVER = 'https://firebase.sellersprite.com',
        FIREBASE_PVK = 'BBYhvTqYbQ3nKe0R-0sH30LQcI00pVxwqbSkP8PcpLkTsAKxRk9l-Ngx9okP3u7dLeAsL7pRtDHfs3SfsT_QvMs',
        messaging = firebase.messaging();
    messaging.usePublicVapidKey(FIREBASE_PVK);

    messaging.onTokenRefresh(() => {
        messaging.getToken().then((refreshedToken) => {
            sendTokenToServer(refreshedToken);
        }).catch((err) => {
            console.log('Unable to retrieve refreshed token ', err);
        });
    });

    messaging.getToken().then((currentToken) => {
        if (currentToken) {
            sendTokenToServer(currentToken);
        } else {
            messaging.requestPermission().then(() => {
                return messaging.getToken();
            }).then(token => {
                sendTokenToServer(token)
            }).catch(err => console.log('An error occurred while retrieving token. ', err))
        }

        messaging.onMessage((payload) => {
            fDisplayMessages(payload);
        });
    }).catch((err) => {
        console.log('An error occurred while retrieving token. ', err);
    });

    function sendTokenToServer(token) {
        // 从未初始化的用户
        if (!window.FIREBASE_TOPICS || window.FIREBASE_TOPICS.length < 1) return false;
        if (!isTokenSentToServer(token)) {
            let data = {token: token, topics: window.FIREBASE_TOPICS.join(',')}

            sendPushToken(token)
            //向后端存储新获取的token
            fetch(FIREBASE_SERVER + "/firebase/subscribe", {
                method: "post",
                mode: 'cors',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            }).then(response => response.json()).then(res => {
                if (res.code === 'ok') {
                    setTokenSentToServer(token)
                }
            });

            // 取消之前的订阅主体
            if (window.FIREBASE_TOPIC_MEMBER_LEVEL && window.FIREBASE_TOPIC_MEMBER_LEVEL.length > 1
                && window.FIREBASE_TOPIC_MEMBER_LEVEL !== fGetLastMemberLevel()
                && fGetLastMemberLevel().length > 1) {
                fetch(FIREBASE_SERVER + "/firebase/unsubscribe", {
                    method: "post",
                    mode: 'cors',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({token: token, topics: fGetLastMemberLevel()})
                }).then(response => response.json()).then(res => {
                    res.code === 'ok' && localStorage.setItem(FIREBASE_ITEM_LAST_KEY, localStorage.getItem(FIREBASE_ITEM_KEY));
                })
            }
        } else {
            console.log("Token already sent to server so won't send it again unless it changes");
        }
    }

    //向后端存储新获取的token
    function sendPushToken(token){
        let data = {token: token, time: new Date().getTime()}
        fetch(FIREBASE_TOKE_ADD_URL + "/v2/firebase/add", {
            method: "post",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        }).then(response => response.json()).then(res => {
            console.log("推送token成功")
        })
    }

    function setTokenSentToServer(token) {
        let val = {
            tk: token,
            topics: window.FIREBASE_TOPICS,
            ml: window.FIREBASE_TOPIC_MEMBER_LEVEL || '',
            time: new Date().getTime()
        }, strings = JSON.stringify(val);
        localStorage.setItem(FIREBASE_ITEM_KEY, strings);
        let b = JSON.parse(localStorage.getItem(FIREBASE_ITEM_LAST_KEY) || '{}');
        if (!b['time'] || !b['ml'])
            localStorage.setItem(FIREBASE_ITEM_LAST_KEY, strings);
    }

    function fGetLastMemberLevel() {
        let t = JSON.parse(localStorage.getItem(FIREBASE_ITEM_LAST_KEY) || '{}');
        return t && t['ml'] || '';
    }

    function isTokenSentToServer(token) {
        // token最大有效时间=24小时，否则强制刷新
        let t = JSON.parse(localStorage.getItem(FIREBASE_ITEM_KEY) || '{}'),
            tl = JSON.parse(localStorage.getItem(FIREBASE_ITEM_LAST_KEY) || '{}');
        return t && t['tk'] && t['ml'] && t['tk'] === token && t['time']
            && t['time'] > new Date().getTime() - 24 * 3600 * 1000;
        // if (t && t['time'] && t['time'] > new Date().getTime() - 24 * 3600 * 1000) return true;
        // return t && t['tk'] && t['ml'] && t['tk'] === token && tl && tl['ml'] && t['ml'] === tl['ml'];
    }
})();
