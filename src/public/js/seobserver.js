$(document).ready(function() {
    $("body").append(`
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: #000000f0; z-index: 1000; display: flex; align-items: center; justify-content: center;">
            <div class="alert alert-danger" style="max-width: 500px;">Please wait while we're establishing a session with seobserver servers. The operation may take up to 5 minutes; please be patient. Don't close this tab....</div>
        </div>
    `);
    $.ajax({
        url: "/do-auto-login",
        method: "GET",
        dataType: "json",
        processData: false,
        contentType: false,
        timeout: 100000
    }).then(function(res) {
        if (res.status) {
            $("#UserEmail").val(res.user.email);
            $("#UserPassword").val(res.user.password);
            $("#UserLoginForm").submit();
        }
        console.log(res);
    });
});