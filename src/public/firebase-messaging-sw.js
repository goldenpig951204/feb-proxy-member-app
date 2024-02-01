// Import and configure the Firebase SDK
// These scripts are made available when the app is served or deployed on Firebase Hosting
// If you do not serve/host your project using Firebase Hosting see https://firebase.google.com/docs/web/setup
importScripts('https://www.gstatic.com/firebasejs/8.4.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.4.1/firebase-messaging.js');

const firebaseConfig = {
    apiKey: "AIzaSyAtxVtJ_lZ0OgiDTfzfZYqwR8VJyneJfds",
    authDomain: "seller-sprite.firebaseapp.com",
    databaseURL: "https://seller-sprite.firebaseio.com",
    projectId: "seller-sprite",
    storageBucket: "seller-sprite.appspot.com",
    messagingSenderId: "284356059972",
    appId: "1:284356059972:web:b4c0649dfc39ef33036d11",
    measurementId: "G-CN0F80S6GL"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

/**
 * Here is is the code snippet to initialize Firebase Messaging in the Service
 * Worker when your app is not hosted on Firebase Hosting.

 // [START initialize_firebase_in_sw]
 // Give the service worker access to Firebase Messaging.
 // Note that you can only use Firebase Messaging here, other Firebase libraries
 // are not available in the service worker.
 importScripts('https://www.gstatic.com/firebasejs/7.15.0/firebase-app.js');
 importScripts('https://www.gstatic.com/firebasejs/7.15.0/firebase-messaging.js');

 // Initialize the Firebase app in the service worker by passing in
 // your app's Firebase config object.
 // https://firebase.google.com/docs/web/setup#config-object
 firebase.initializeApp({
   apiKey: 'api-key',
   authDomain: 'project-id.firebaseapp.com',
   databaseURL: 'https://project-id.firebaseio.com',
   projectId: 'project-id',
   storageBucket: 'project-id.appspot.com',
   messagingSenderId: 'sender-id',
   appId: 'app-id',
   measurementId: 'G-measurement-id',
 });

 // Retrieve an instance of Firebase Messaging so that it can handle background
 // messages.
const messaging = firebase.messaging();
 // [END initialize_firebase_in_sw]
 **/


// If you would like to customize notifications that are received in the
// background (Web app is closed or not in browser focus) then you should
// implement this optional method.
// [START background_handler]
// messaging.setBackgroundMessageHandler(function (payload) {
//     console.log('[firebase-messaging-sw.js] Received background message ', payload);
//     // Customize notification here
//     const notificationTitle = 'Background Message Title';
//     const notificationOptions = {
//         body: 'Background Message body.',
//         icon: '/assets/img/sellersprite-log.png'
//     };
//
//     return self.registration.showNotification(notificationTitle, notificationOptions);
// });
// [END background_handler]
messaging.onBackgroundMessage(function (payload) {
    console.log('[firebase-messaging-sw.js] 收到后台消息： ', payload);
    // Customize notification here
    const title = (payload['notification'] && payload['notification']['title']
        || payload['data'] && payload['data']['title'] || '您有新的消息') + '*';
    let link = payload['data'] && payload['data']['callback_link'] || 'https://www.sellersprite.com/?source=firebase_sw';
    let id = payload['data'] && payload['data']['id'] || '';
    let sender = self.registration;

    function _send() {
        const options = {
            body: payload['notification'] && payload['notification']['body'] || '(来自卖家精灵) ...',
            icon: '/assets/img/sellersprite-log.png',
            data: {link: link}
        };
        sender.showNotification(title, options);
    }

    // 防止消息被重复处理
    if (id !== '') {
        // https://github.com/firebase/quickstart-js/issues/111
        // Local Storage isn't available in service worker - you'll need to use IndexedDB which will work in both the window and the service worker.
        // 基本上这里是拿不到 ls 的
        let ls = self.window && self.window.localStorage || self.localStorage;
        if (ls && ls.getItem(id)) return false;
        let millis = Math.ceil(Math.random() * 1000);
        let v = new Date().getTime() + '-' + millis;
        setTimeout(function () {
            if (ls && ls.getItem(id)) return false;
            ls && ls.setItem(id, v);
            if (ls && ls.getItem(id) !== v) return false;
            _send();
        }, millis);
        return true;
    }

    _send();
});

self.addEventListener('notificationclick', function (event) {
    console.log('--- firebase-messaging-sw ---');
    console.log(event);
    let data = event.notification.data;
    event.notification.close();
    const l = data && data['link'] || '/?source=firebase_sw';
    const chain = self.clients.openWindow(l);
    event.waitUntil(chain);
});
