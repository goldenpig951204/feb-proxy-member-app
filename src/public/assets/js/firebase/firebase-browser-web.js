$(function () {
    var Fn = {
        node: {
            $body: $("body"),
        },
        init: function () {
            let that = this;
            //  动态绑定事件
           // 无论关闭还是打开链接都是打开链接
           that.node.$body.on("click",'#firebase-browser-message .right-firebase,#firebase-browser-message .close-btn-base,#firebase-browser-message .open-link-firebase',function(){
                let url = $(this).parents(".firebase-box-message").attr("data-link") || '/',$dom = $("#firebase-browser-message");;
                $dom.find(".firebase-box-message").length==1?$dom.remove():$(this).parents(".firebase-box-message").css('right','-9999px').remove();
                $(this).is(".close-btn-base")?null:window.open(url);
            });
            that.node.$body.on("click",'#firebase-browser-message .myFirebaseChange',function(){
                that.autoPlay()
            });
        },
        autoPlay:function() {//自动播放函数
            let audioPlay = document.getElementById("myFirebaseaudio");
            audioPlay.play()
        }
    }
  window.firebaseBrowsermessage = Fn;
  window.firebaseBrowsermessage.init();
});
  // 前端接收浏览器消息
window.createBrowsermessage = function(str) {
    if(str&&str.notification){
        let $dom = null;
        if(!document.querySelector("#firebase-browser-message")){
            $("body").append($("#tpl-browser-message-main-body").tmpl({}));
        }
        $dom = $("#firebase-browser-message");
        $dom.append($("#tpl-browser-message-body").tmpl({
                BrowserMessageInfor: str,
                view_it_now:GLOBAL_MOMENT_LANGUAGE || ''
        }))//当还没hide时禁止重复点击
        setTimeout(() => {
            $dom.find(".myFirebaseChange").click();
            $dom.find(".firebase-box-message").css('right','22px');
          }, 10)

    }
};

