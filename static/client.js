var Est_Time;
var Est_Set;
var Est_Time_Seconds;
var DisplayNumb = window.DisplayNumb;
var AdminCurrentCode = [];
var AdminCurrentString = "";
var CurrentlyEnteringAdminCode = false;

var HasGottenANewUpdate = false;
var isInFullscreen = false;

function openFullscreen() {
    console.log('opening full-screen mode.');
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) { /* Safari */
        document.documentElement.webkitRequestFullscreen();
    } else if (document.documentElement.msRequestFullscreen) { /* IE11 */
        document.documentElement.msRequestFullscreen();
    }
    $("#FullScreen").modal("hide");
}
$("#FullScreen").modal("show");
// document.getElementById("FullScreenBtn").onclick = openFullscreen();
document.getElementById('FullScreenBtn').onclick = function(e) {
    console.log('opening full-screen mode. ');
    if (document.getElementById("body").requestFullscreen) {
        document.getElementById("body").requestFullscreen();
    } else if (document.getElementById("body").webkitRequestFullscreen) { /* Safari */
        document.getElementById("body").webkitRequestFullscreen();
    } else if (document.getElementById("body").msRequestFullscreen) { /* IE11 */
        document.getElementById("body").msRequestFullscreen();
    }
    $("#FullScreen").modal("hide");
};

var chatSocket;

if (window.location.host === "127.0.0.1:8000") {
    chatSocket = new ReconnectingWebSocket('ws://' + window.location.host + '/ws/main/');

} else {

    chatSocket = new ReconnectingWebSocket('wss://' + window.location.host + '/ws/main/');
}

document.addEventListener('fullscreenchange', (event) => {
  if (document.fullscreenElement) {
    console.log('Entered fullscreen mode.');
    isInFullscreen = true;
  } else {
    console.log('Leaving full-screen mode.');
    isInFullscreen = false;
    chatSocket.send(JSON.stringify({'command': 'send_tamper_alert', 'display': DisplayNumb}));
    alert("Tampering Reported.");
  }
});

var countdown = setInterval(function() {
    if (Est_Time != 0) {
        if (Est_Time_Seconds >= 60) {
            document.getElementById('est-text').innerHTML = Est_Time.toString() + " Minutes";
            Est_Time -= 1;
            Est_Time_Seconds = 0;
        }
        if (Est_Set) {
            Est_Set = false;
            if (Est_Time == -1) {
                document.getElementById('est-text').innerHTML = "~";
                Est_Time = 0;
            } else {
                document.getElementById('est-text').innerHTML = Est_Time.toString() + " Minutes";
            }
        }
        Est_Time_Seconds += 1;
    }
    else {
        document.getElementById('est-text').innerHTML = "~";
    }
}, 1000)

chatSocket.onopen = function(e) {
    document.getElementById('mainContainer').style.display = "flex";
    document.getElementById('offlineContainer').style.display = "none";
    update();
    setTimeout(IsStillOnline, 10000);
}

function playSound() {
    var audio = new Audio(audioFile);
    audio.play();
}

chatSocket.onmessage = function(e) {
    var data = JSON.parse(e.data);
    if (data['type'] === 'UpdateLocation') {
        if (_playSound == "True" && document.getElementById('current-text').innerHTML != data['current']) { playSound(); }
        document.getElementById('current-text').innerHTML = data['current'];
        document.getElementById('next-text').innerHTML = data['next'];
        document.getElementById('after-text').innerHTML = data['after'];
        Est_Time_Seconds = 0;
        Est_Set = true;
        Est_Time = data['est'];
    } else if (data['type'] === 'connectedDisplays') {
        chatSocket.send(JSON.stringify({'command': 'set_connected_display', 'display': DisplayNumb, 'is_protected': isInFullscreen}));
        document.getElementById('mainContainer').style.display = "flex";
        document.getElementById('offlineContainer').style.display = "none";
        HasGottenANewUpdate = true;
    } else if (data['type'] === 'rfid_auth') {
        $("#Authorise").modal("hide");
        CurrentlyEnteringAdminCode = false;
        if (data['success']){
            $("#AdminControl").modal("show");
        }
    }
};

chatSocket.onclose = function(e) { console.error('Chat socket closed unexpectedly'); }; // This means the client is Offline!!!

function update() { chatSocket.send(JSON.stringify({'command': 'ask_admin_for_current_increment'})); }

(document).onkeydown = function(event){
    var keynum;
    if(window.event) { // IE
      keynum = event.keyCode;
    } else if(e.which){ // Netscape/Firefox/Opera
      keynum = event.which;
    }

    // Is "C" key pressed? If so open up auth prompt
    if (keynum == 67 && !CurrentlyEnteringAdminCode) {
        AdminCurrentCode = [];
        convertCode(AdminCurrentCode);
        $("#Authorise").modal("show");
        document.getElementById('AuthoriseSubmit').onclick = function(e) {
            chatSocket.send(JSON.stringify({'command': 'rfid_auth', 'rfid': AdminCurrentCode.toString().split(",").join("")}));
        };
        document.getElementById('AuthoriseClose').onclick = function(e) {
           CurrentlyEnteringAdminCode = false;
        };
        CurrentlyEnteringAdminCode = true;
    }
    if (keynum == 49  && CurrentlyEnteringAdminCode) { AdminCurrentCode.push("1"); convertCode(AdminCurrentCode); } // 1
    else if (keynum == 50  && CurrentlyEnteringAdminCode) { AdminCurrentCode.push("2"); convertCode(AdminCurrentCode); } // 2
    else if (keynum == 51  && CurrentlyEnteringAdminCode) { AdminCurrentCode.push("3"); convertCode(AdminCurrentCode); } // 3
    else if (keynum == 52  && CurrentlyEnteringAdminCode) { AdminCurrentCode.push("4"); convertCode(AdminCurrentCode); } // 4
    else if (keynum == 53  && CurrentlyEnteringAdminCode) { AdminCurrentCode.push("5"); convertCode(AdminCurrentCode); } // 5
    else if (keynum == 54  && CurrentlyEnteringAdminCode) { AdminCurrentCode.push("6"); convertCode(AdminCurrentCode); } // 6
    else if (keynum == 55  && CurrentlyEnteringAdminCode) { AdminCurrentCode.push("7"); convertCode(AdminCurrentCode); } // 7
    else if (keynum == 56  && CurrentlyEnteringAdminCode) { AdminCurrentCode.push("8"); convertCode(AdminCurrentCode); } // 8
    else if (keynum == 57  && CurrentlyEnteringAdminCode) { AdminCurrentCode.push("9"); convertCode(AdminCurrentCode); } // 9
    else if (keynum == 48  && CurrentlyEnteringAdminCode) { AdminCurrentCode.push("0"); convertCode(AdminCurrentCode); } // 0
    else if (keynum == 8  && CurrentlyEnteringAdminCode) { AdminCurrentCode.pop(); convertCode(AdminCurrentCode); } // delete
    else if (keynum == 13  && CurrentlyEnteringAdminCode) { chatSocket.send(JSON.stringify({'command': 'rfid_auth', 'rfid': AdminCurrentCode.toString().split(",").join("")})); } // return
};

function convertCode(code){
    document.getElementById('RFID').value = "";
    for (var i = 0; i < code.length; i++) {
        document.getElementById('RFID').value += "*";
    }
}

document.getElementById('AdminControl-SwitchDisplay').onclick = function(e) { window.location.pathname = 'clients/'; };

document.getElementById('AdminControl-Reload').onclick  = function(e) { location.reload(); };

function IsStillOnline() {
    if (HasGottenANewUpdate) {
        console.log("Online");
        HasGottenANewUpdate = false;
        document.getElementById('mainContainer').style.display = "flex";
        document.getElementById('offlineContainer').style.display = "none";
    } else {
        console.log("Offline");
        document.getElementById('mainContainer').style.display = "none";
        console.log(document.getElementById('mainContainer').style.display)
        document.getElementById('offlineContainer').style.display = "block";
    }
    setTimeout(IsStillOnline, 10000);
}


