var CurrentIncrement = 0;
var ListEnd;
var Est_Time;
var Est_Set;
var Est_Time_Seconds;
var LastDisplaysConnectionList = [false, false, false, false, false, false];
var DisplaysConnectionList = [false, false, false, false, false, false];
var timer = 5;
var EditingNumber = 0;

var chatSocket = new WebSocket('ws://' + window.location.host + '/ws/main/');

function showProblem(errorText) {
    $("#ProblemDialogue").modal("show");
    document.querySelector('#ProblemDialogueText').innerHTML = errorText;
}

var countdown = setInterval(function() {
    if (Est_Time != 0) {
        if (Est_Time_Seconds >= 60) {
            document.getElementById('est-text').innerHTML = Est_Time.toString() + " Minutes";
            Est_Time -= 1;
            Est_Time_Seconds = 0;
        }
        if (Est_Set) {
            Est_Set = false;
            document.getElementById('est-text').innerHTML = Est_Time.toString() + " Minutes";
        }
        Est_Time_Seconds += 1;
    }
    else {
        document.getElementById('est-text').innerHTML = "0 Minutes";
    }
}, 1000)

chatSocket.onopen = function(e) {
    get_length_of_list();

    showLoaders();
    document.querySelector('#main').style.display = "none";
    document.querySelector('#loader').style.display = "block";
    chatSocket.send(JSON.stringify({'command': 'admin_send_update_message', 'index': CurrentIncrement}));
    document.querySelector('#backward').disabled = true;
}

chatSocket.onmessage = function(e) {
    var data = JSON.parse(e.data);
    if (data['type'] === 'UpdateLocation') {
        document.querySelector('#main').style.display = "block";
        document.querySelector('#loader').style.display = "none";
        document.getElementById('current-text').innerHTML = data['current'];
        document.getElementById('next-text').innerHTML = data['next'];
        document.getElementById('after-text').innerHTML = data['after'];
        Est_Time_Seconds = 0;
        Est_Set = true;
        Est_Time = data['est'];
    }
    else if (data['type'] === 'get_length_of_list') {
        ListEnd = data["value"]
    }
    else if (data['type'] === 'ask_admin_for_current_increment') {
        chatSocket.send(JSON.stringify({'command': 'admin_send_update_message', 'index': CurrentIncrement}));
    }
    else if (data['type'] === 'connectedDisplay') {
        hideLoader(data['display']);
        DisplaysConnectionList[data['display'] - 1] = true;
    }
    else if (data['type'] === 'tamperAlert') {
        displayName = "ERROR";
        if (data['display'] == '0') { displayName = configName1; }
        if (data['display'] == '1') { displayName = configName2; }
        if (data['display'] == '2') { displayName = configName3; }
        if (data['display'] == '3') { displayName = configName4; }
        if (data['display'] == '4') { displayName = configName5; }
        if (data['display'] == '5') { displayName = configName6; }
        showProblem("Tamper Alert on " + displayName + "!");
    }
};

chatSocket.onclose = function(e) { console.error('Chat socket closed unexpectedly'); };

document.querySelector('#forward').onclick = function(e) {
    if (CurrentIncrement + 1 < ListEnd) { CurrentIncrement++; }
    document.querySelector('#main').style.display = "none";
    document.querySelector('#loader').style.display = "block";
    chatSocket.send(JSON.stringify({'command': 'admin_send_update_message', 'index': CurrentIncrement}));
    if (CurrentIncrement < ListEnd - 1) { document.querySelector('#forward').disabled = false; document.querySelector('#backward').disabled = false; }
    else { document.querySelector('#forward').disabled = true; }
};
document.querySelector('#backward').onclick = function(e) {
    if (CurrentIncrement > 0) { CurrentIncrement--; }
    document.querySelector('#main').style.display = "none";
    document.querySelector('#loader').style.display = "block";
    chatSocket.send(JSON.stringify({'command': 'admin_send_update_message', 'index': CurrentIncrement}));
    if (CurrentIncrement > 0) { document.querySelector('#backward').disabled = false; document.querySelector('#forward').disabled = false; }
    else { document.querySelector('#backward').disabled = true; }
};

function get_length_of_list() { chatSocket.send(JSON.stringify({'command': 'get_length_of_list'})); }

function update() { chatSocket.send(JSON.stringify({'command': 'ask_admin_for_current_increment'})); }

var timerInterval = setInterval(function() {
    if (timer == 5){
        showLoaders();
        LastDisplaysConnectionList = DisplaysConnectionList;
        DisplaysConnectionList = [false, false, false, false, false, false];
        chatSocket.send(JSON.stringify({'command': 'get_connected_displays'}));
    }
    else if (timer == 7) {
        hideLoaders();
        if (DisplaysConnectionList[0]) { document.querySelector('#display-1').style.backgroundColor = "green"; }
        else { document.querySelector('#display-1').style.backgroundColor = ""; }

        if (DisplaysConnectionList[1] == true) { document.querySelector('#display-2').style.backgroundColor = "green"; }
        else { document.querySelector('#display-2').style.backgroundColor = ""; }

        if (DisplaysConnectionList[2] == true) { document.querySelector('#display-3').style.backgroundColor = "green"; }
        else { document.querySelector('#display-3').style.backgroundColor = ""; }

        if (DisplaysConnectionList[3] == true) { document.querySelector('#display-4').style.backgroundColor = "green"; }
        else { document.querySelector('#display-4').style.backgroundColor = ""; }

        if (DisplaysConnectionList[4] == true) { document.querySelector('#display-5').style.backgroundColor = "green"; }
        else { document.querySelector('#display-5').style.backgroundColor = ""; }

        if (DisplaysConnectionList[5] == true) { document.querySelector('#display-6').style.backgroundColor = "green"; }
        else { document.querySelector('#display-6').style.backgroundColor = ""; }

        for (var x = 0; x < 6; x++){
            // console.log(DisplaysConnectionList[x]);
            // console.log(LastDisplaysConnectionList[x]);
            if (DisplaysConnectionList[x] == false && DisplaysConnectionList[x] != LastDisplaysConnectionList[x]) {
                console.log("Sending Notification");
                var options = {
                    body: "A Irregular Disconnection has occurred."
                }
                displayName = "ERROR";
                if (x == 0) { displayName = configName1; }
                if (x == 1) { displayName = configName2; }
                if (x == 2) { displayName = configName3; }
                if (x == 3) { displayName = configName4; }
                if (x == 4) { displayName = configName5; }
                if (x == 5) { displayName = configName6; }
                showProblem("Display " + displayName + " Has Disconnected!");
            }
        }

        timer = 0;
    }
    timer++;
}, 1000)

function showLoaders() {
    document.querySelector('#display-1').style.display = "none";
    document.querySelector('#display-1-loader').style.display = "block";

    document.querySelector('#display-2').style.display = "none";
    document.querySelector('#display-2-loader').style.display = "block";

    document.querySelector('#display-3').style.display = "none";
    document.querySelector('#display-3-loader').style.display = "block";

    document.querySelector('#display-4').style.display = "none";
    document.querySelector('#display-4-loader').style.display = "block";

    document.querySelector('#display-5').style.display = "none";
    document.querySelector('#display-5-loader').style.display = "block";

    document.querySelector('#display-6').style.display = "none";
    document.querySelector('#display-6-loader').style.display = "block";
}

function hideLoaders() {
    document.querySelector('#display-1').style.display = "block";
    document.querySelector('#display-1-loader').style.display = "none";

    document.querySelector('#display-2').style.display = "block";
    document.querySelector('#display-2-loader').style.display = "none";

    document.querySelector('#display-3').style.display = "block";
    document.querySelector('#display-3-loader').style.display = "none";

    document.querySelector('#display-4').style.display = "block";
    document.querySelector('#display-4-loader').style.display = "none";

    document.querySelector('#display-5').style.display = "block";
    document.querySelector('#display-5-loader').style.display = "none";

    document.querySelector('#display-6').style.display = "block";
    document.querySelector('#display-6-loader').style.display = "none";
}

function hideLoader(LoaderID) {
    _reg = '#display-' + LoaderID;
    _loader = '#display-' + LoaderID + "-loader";
    document.querySelector(_reg).style.display = "block";
    document.querySelector(_loader).style.display = "none";
    document.querySelector(_reg).style.backgroundColor = "green"
}

$(document).ready(function(){
    $("#display-1").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 1;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + configName1;
        document.querySelector('#EditDisplayName').value = configName1;
        document.querySelector('#EditDisplaySound').checked = convertPythonBoolToJSBool(configSound1);
    });
    $("#display-2").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 2;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + configName2;
        document.querySelector('#EditDisplayName').placeholder = configName2;
        document.querySelector('#EditDisplaySound').checked = convertPythonBoolToJSBool(configSound2);
    });
    $("#display-3").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 3;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + configName3;
        document.querySelector('#EditDisplayName').placeholder = configName3;
        document.querySelector('#EditDisplaySound').checked = convertPythonBoolToJSBool(configSound3);
    });
    $("#display-4").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 4;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + configName4;
        document.querySelector('#EditDisplayName').placeholder = configName4;
        document.querySelector('#EditDisplaySound').checked = convertPythonBoolToJSBool(configSound4);
    });
    $("#display-5").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 5;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + configName5;
        document.querySelector('#EditDisplayName').placeholder = configName5;
        document.querySelector('#EditDisplaySound').checked = convertPythonBoolToJSBool(configSound5);
    });
    $("#display-6").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 6;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + configName6;
        document.querySelector('#EditDisplayName').placeholder = configName6;
        document.querySelector('#EditDisplaySound').checked = convertPythonBoolToJSBool(configSound6);
    });
    $("#EditDisplaySave").click(function(){
        $("#EditDisplay").modal("hide");
        if (EditingNumber == 1) {
            configName1 = document.querySelector('#EditDisplayName').value;
            configSound1 = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        } else if (EditingNumber == 2) {
            configName2 = document.querySelector('#EditDisplayName').value;
            configSound2 = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        } else if (EditingNumber == 3) {
            configName3 = document.querySelector('#EditDisplayName').value;
            configSound3 = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        } else if (EditingNumber == 4) {
            configName4 = document.querySelector('#EditDisplayName').value;
            configSound4 = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        } else if (EditingNumber == 5) {
            configName5 = document.querySelector('#EditDisplayName').value;
            configSound5 = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        } else if (EditingNumber == 6) {
            configName6 = document.querySelector('#EditDisplayName').value;
            configSound6 = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        }
        chatSocket.send(JSON.stringify({
            'command': 'updateDisplayModel',
            'configName1': configName1,
            'configName2': configName2,
            'configName3': configName3,
            'configName4': configName4,
            'configName5': configName5,
            'configName6': configName6,
            'configSound1': configSound1,
            'configSound2': configSound2,
            'configSound3': configSound3,
            'configSound4': configSound4,
            'configSound5': configSound5,
            'configSound6': configSound6,
        }));
        updateDisplayValues();
    });
});

function updateDisplayValues() {
    document.querySelector('#display-1').innerHTML = configName1;
    document.querySelector('#display-2').innerHTML = configName2;
    document.querySelector('#display-3').innerHTML = configName3;
    document.querySelector('#display-4').innerHTML = configName4;
    document.querySelector('#display-5').innerHTML = configName5;
    document.querySelector('#display-6').innerHTML = configName6;
}

function convertPythonBoolToJSBool(bool) { if (bool == "True") { return true; } else { return false; }}
function convertJSBoolToPythonBool(bool) { if (bool == true) { return "True"; } else { return "False"; }}

(document).onkeydown = function(event){
    var keynum;
    if(window.event) { // IE
      keynum = event.keyCode;
    } else if(e.which){ // Netscape/Firefox/Opera
      keynum = event.which;
    }

    if (keynum == 32) {
        if (CurrentIncrement + 1 < ListEnd) { CurrentIncrement++; }
        document.querySelector('#main').style.display = "none";
        document.querySelector('#loader').style.display = "block";
        chatSocket.send(JSON.stringify({'command': 'admin_send_update_message', 'index': CurrentIncrement}));
        if (CurrentIncrement < ListEnd - 1) { document.querySelector('#forward').disabled = false; document.querySelector('#backward').disabled = false; }
        else { document.querySelector('#forward').disabled = true; }
    } else if (keynum == 39) {
        if (CurrentIncrement + 1 < ListEnd) { CurrentIncrement++; }
        document.querySelector('#main').style.display = "none";
        document.querySelector('#loader').style.display = "block";
        chatSocket.send(JSON.stringify({'command': 'admin_send_update_message', 'index': CurrentIncrement}));
        if (CurrentIncrement < ListEnd - 1) { document.querySelector('#forward').disabled = false; document.querySelector('#backward').disabled = false; }
        else { document.querySelector('#forward').disabled = true; }
    } else if (keynum == 37) {
        if (CurrentIncrement > 0) { CurrentIncrement--; }
        document.querySelector('#main').style.display = "none";
        document.querySelector('#loader').style.display = "block";
        chatSocket.send(JSON.stringify({'command': 'admin_send_update_message', 'index': CurrentIncrement}));
        if (CurrentIncrement > 0) { document.querySelector('#backward').disabled = false; document.querySelector('#forward').disabled = false; }
        else { document.querySelector('#backward').disabled = true; }
    }
};
