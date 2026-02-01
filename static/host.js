var cur_increment = 0;
var ListEnd;

var est_time_seconds = 0;

var time_elapsed = 0;
let timer_ref = null;

var LastDisplaysConnectionList = [false, false, false, false, false, false];
var DisplaysConnectionList = [false, false, false, false, false, false];
var protectedConnectionList = [false, false, false, false, false, false];
var timer = 2;
var EditingNumber = 0;

var websocket

// Don't show loaders anymore
hideLoaders();

if (window.location.host === "127.0.0.1:8000") {
    console.log(window.location.host)
    websocket = new ReconnectingWebSocket('ws://' + window.location.host + '/ws/main/');

} else {

    websocket = new ReconnectingWebSocket('wss://' + window.location.host + '/ws/main/');
}

function showProblem(errorText) {
    $("#ProblemDialogue").modal("show");
    document.querySelector('#ProblemDialogueText').innerHTML = errorText;
}

const sec_to_time = (seconds) => {
    let mins = Math.floor(seconds / 60);
    let secs = seconds % 60;
    return mins.toString() + ":" + secs.toString().padStart(2, '0');
}

const countdownFunction = () => {
    time_elapsed++;
    let time = sec_to_time(time_elapsed);
    let time_left = sec_to_time(est_time_seconds);
    // console.log(est_time_seconds, time_left);
    // console.log(est_time_seconds, time_elapsed);
    
    if (est_time_seconds != 0 && est_time_seconds > 0) {
        document.getElementById('est-text').innerHTML = time_left + " / " + time;
        est_time_seconds--;
    }
    else {
        document.getElementById('est-text').innerHTML = "~:~~ / " + time;
    }
};

websocket.onopen = function(e) {
    get_length_of_list();

    // Don't show loaders anymore
    // showLoaders();
    showStatusLoader();
    websocket.send(JSON.stringify({'command': 'admin_send_update_message', 'index': cur_increment}));
    document.querySelector('#backward').disabled = true;

    console.log("Configs loaded:", window.configs);
    confirmAllDisplaysInConfig();
    updateDisplayValues();
}

websocket.onmessage = function(e) {
    var data = JSON.parse(e.data);
    if (data['type'] === 'UpdateLocation') {
        hideStatusLoader();
        document.getElementById('current-text').innerHTML = data['current'];
        document.getElementById('next-text').innerHTML = data['next'];
        document.getElementById('after-text').innerHTML = data['after'];

        est_time_seconds = data['est'];
        time_elapsed = 0;

        if (timer_ref) { clearInterval(timer_ref); }
        countdownFunction();
        timer_ref = setInterval(countdownFunction, 1000);
    }
    else if (data['type'] === 'get_length_of_list') {
        ListEnd = data["value"]
    }
    else if (data['type'] === 'ask_admin_for_current_increment') {
        websocket.send(JSON.stringify({'command': 'admin_send_update_message', 'index': cur_increment}));
    }
    else if (data['type'] === 'connectedDisplay') {
        DisplaysConnectionList[data['display'] - 1] = true;
        protectedConnectionList[data['display'] - 1] = data['is_protected']
        hideLoader(data['display']);
    }
    else if (data['type'] === 'tamperAlert') {
        displayName = "ERROR";
        if (data['display'] == '1') { displayName = window.configs[0].name; }
        if (data['display'] == '2') { displayName = window.configs[1].name; }
        if (data['display'] == '3') { displayName = window.configs[2].name; }
        if (data['display'] == '4') { displayName = window.configs[3].name; }
        if (data['display'] == '5') { displayName = window.configs[4].name; }
        if (data['display'] == '6') { displayName = window.configs[5].name; }
        console.log(data['display']);
        console.log(parseInt(data['display']));
        console.log(parseInt(data['display']) + 1);
        console.log((parseInt(data['display']) + 1).toString());

        showProblem("Tamper Alert on " + displayName + "!");
        document.querySelector('#display-' + data['display']).style.backgroundColor = "orange";
    }
};

websocket.onclose = function(e) { console.error('Chat socket closed unexpectedly'); };

function get_length_of_list() { websocket.send(JSON.stringify({'command': 'get_length_of_list'})); }

function update() { websocket.send(JSON.stringify({'command': 'ask_admin_for_current_increment'})); }

const timerInterval = setInterval(function() {
    if (timer == 5){
        // Don't show loaders anymore
        // showLoaders();
        LastDisplaysConnectionList = DisplaysConnectionList;
        DisplaysConnectionList = [false, false, false, false, false, false];
        protectedConnectionList = [false, false, false, false, false, false];
        websocket.send(JSON.stringify({'command': 'get_connected_displays'}));
    }
    else if (timer == 10) {
        hideLoaders();
        if (DisplaysConnectionList[0] && protectedConnectionList[0]) { document.querySelector('#display-1').style.backgroundColor = "green"; }
        else if (DisplaysConnectionList[0]) { document.querySelector('#display-1').style.backgroundColor = "orange"; }
        else { document.querySelector('#display-1').style.backgroundColor = ""; }

        if (DisplaysConnectionList[1] && protectedConnectionList[1]) { document.querySelector('#display-2').style.backgroundColor = "green"; }
        else if (DisplaysConnectionList[1]) { document.querySelector('#display-2').style.backgroundColor = "orange"; }
        else { document.querySelector('#display-2').style.backgroundColor = ""; }

        if (DisplaysConnectionList[2] && protectedConnectionList[2]) { document.querySelector('#display-3').style.backgroundColor = "green"; }
        else if (DisplaysConnectionList[2]) { document.querySelector('#display-3').style.backgroundColor = "orange"; }
        else { document.querySelector('#display-3').style.backgroundColor = ""; }

        if (DisplaysConnectionList[3] && protectedConnectionList[3]) { document.querySelector('#display-4').style.backgroundColor = "green"; }
        else if (DisplaysConnectionList[3]) { document.querySelector('#display-4').style.backgroundColor = "orange"; }
        else { document.querySelector('#display-4').style.backgroundColor = ""; }

        if (DisplaysConnectionList[4] && protectedConnectionList[4]) { document.querySelector('#display-5').style.backgroundColor = "green"; }
        else if (DisplaysConnectionList[4]) { document.querySelector('#display-5').style.backgroundColor = "orange"; }
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
                if (x == 0) { displayName = window.configs[0].name; }
                if (x == 1) { displayName = window.configs[1].name; }
                if (x == 2) { displayName = window.configs[2].name; }
                if (x == 3) { displayName = window.configs[3].name; }
                if (x == 4) { displayName = window.configs[4].name; }
                if (x == 5) { displayName = window.configs[5].name; }
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

function showStatusLoader() {
    document.querySelector('#main').style.display = "none";
    document.querySelector('#loader').style.display = "block";
}

function hideStatusLoader() {
    document.querySelector('#main').style.display = "block";
    document.querySelector('#loader').style.display = "none";
}

function hideLoader(LoaderID) {
    _reg = '#display-' + LoaderID;
    _loader = '#display-' + LoaderID + "-loader";
    document.querySelector(_reg).style.display = "block";
    document.querySelector(_loader).style.display = "none";
    if (protectedConnectionList[LoaderID - 1])  { document.querySelector(_reg).style.backgroundColor = "green"; }
    else { document.querySelector(_reg).style.backgroundColor = "orange"; }
}


// Edit Display Modal Controls
$(document).ready(function(){
    $("#display-1").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 1;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + window.configs[0].name;
        document.querySelector('#EditDisplayName').value = window.configs[0].name;
        document.querySelector('#EditDisplaySound').checked = window.configs[0].play_sound;
    });
    $("#display-2").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 2;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + window.configs[1].name;
        document.querySelector('#EditDisplayName').value = window.configs[1].name;
        document.querySelector('#EditDisplaySound').checked = window.configs[1].play_sound;
    });
    $("#display-3").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 3;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + window.configs[2].name;
        document.querySelector('#EditDisplayName').value = window.configs[2].name;
        document.querySelector('#EditDisplaySound').checked = window.configs[2].play_sound;
    });
    $("#display-4").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 4;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + window.configs[3].name;
        document.querySelector('#EditDisplayName').value = window.configs[3].name;
        document.querySelector('#EditDisplaySound').checked = window.configs[3].play_sound;
    });
    $("#display-5").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 5;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + window.configs[4].name;
        document.querySelector('#EditDisplayName').value = window.configs[4].name;
        document.querySelector('#EditDisplaySound').checked = window.configs[4].play_sound;
    });
    $("#display-6").click(function(){
        $("#EditDisplay").modal("show");
        EditingNumber = 6;
        document.querySelector('#EditDisplayLabel').innerHTML = "Edit " + window.configs[5].name;
        document.querySelector('#EditDisplayName').value = window.configs[5].name;
        document.querySelector('#EditDisplaySound').checked = window.configs[5].play_sound;
    });

    $("#EditDisplaySave").click(function(){
        $("#EditDisplay").modal("hide");
        if (EditingNumber == 1) {
            window.configs[0].name = document.querySelector('#EditDisplayName').value;
            window.configs[0].play_sound = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        } else if (EditingNumber == 2) {
            window.configs[1].name = document.querySelector('#EditDisplayName').value;
            window.configs[1].play_sound = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        } else if (EditingNumber == 3) {
            window.configs[2].name = document.querySelector('#EditDisplayName').value;
            window.configs[2].play_sound = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        } else if (EditingNumber == 4) {
            window.configs[3].name = document.querySelector('#EditDisplayName').value;
            window.configs[3].play_sound = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        } else if (EditingNumber == 5) {
            window.configs[4].name = document.querySelector('#EditDisplayName').value;
            window.configs[4].play_sound = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        } else if (EditingNumber == 6) {
            window.configs[5].name = document.querySelector('#EditDisplayName').value;
            window.configs[5].play_sound = convertJSBoolToPythonBool(document.querySelector('#EditDisplaySound').checked);
        }
        websocket.send(JSON.stringify({
            'command': 'updateDisplayModel',
            'configs': JSON.stringify(window.configs),
        }));
        
        updateDisplayValues();
    });
});

function updateDisplayValues() {
    document.querySelector('#display-1').innerHTML = window.configs[0].name;
    document.querySelector('#display-2').innerHTML = window.configs[1].name;
    document.querySelector('#display-3').innerHTML = window.configs[2].name;
    document.querySelector('#display-4').innerHTML = window.configs[3].name;
    document.querySelector('#display-5').innerHTML = window.configs[4].name;
    document.querySelector('#display-6').innerHTML = window.configs[5].name;
}

// Convert JS boolean to Python boolean string
function convertJSBoolToPythonBool(bool) { if (bool == true) { return "True"; } else { return "False"; }}


// Change current increment by modifier
const change_cur_increment = (inc, mod) => {
    if (record_times()) {
        show_time_diologue(inc, time_elapsed);
    }

    cur_increment = inc + mod;
}

const forward = () => {
    if (cur_increment + 1 < ListEnd) {
        change_cur_increment(cur_increment, 1);
    }

    showStatusLoader();

    websocket.send(JSON.stringify({'command': 'admin_send_update_message', 'index': cur_increment}));
    if (cur_increment < ListEnd - 1) {
        document.querySelector('#forward').disabled = false;
        document.querySelector('#backward').disabled = false;
    }
    else {
        document.querySelector('#forward').disabled = true;
    }
};

const back = () => {
    if (cur_increment > 0) {
        change_cur_increment(cur_increment, -1);
    }

    showStatusLoader();

    websocket.send(JSON.stringify({'command': 'admin_send_update_message', 'index': cur_increment}));
    if (cur_increment > 0) {
        document.querySelector('#forward').disabled = false; 
        document.querySelector('#backward').disabled = false; 
    }
    else {
        document.querySelector('#backward').disabled = true;
    }
};

// Keyboard Controls
(document).onkeydown = function(event){
    var keynum;
    if(window.event) { // IE
      keynum = event.keyCode;
    } else if(e.which){ // Netscape/Firefox/Opera
      keynum = event.which;
    }
    
    // Spacekey or Right Arrow
    if (keynum == 32 || keynum == 39) {
        forward();
    } 

    // Left Arrow
    else if (keynum == 37) {
        back();
    }
};

// Forward and Backward Buttons
document.querySelector('#forward').onclick = function(e) {
    forward();
};
document.querySelector('#backward').onclick = function(e) {
    back();
};

// Ensure all displays are in config by adding NONE entries if missing
function confirmAllDisplaysInConfig() {
    var found = [false, false, false, false, false, false];
    for (var i = 0; i < window.configs.length; i++) {
        if (window.configs[i].display_number >= 1 && window.configs[i].display_number <= 6) {
            found[window.configs[i].display_number - 1] = true;
        }
    }

    for (var j = 0; j < 6; j++) {
        if (!found[j]) {
            window.configs.push({'name': 'NONE', 'play_sound': false, 'display_number': j + 1});
        }
    }

    console.log("Final Configs:", window.configs);
    return true;
}


const record_times = () => {
    return document.querySelector('#time-record-switch').checked;
}

const update_scene_time = (index, time) => {
    websocket.send(JSON.stringify({
        'command': 'update_scene_time',
        'scene_index': index,
        'new_time': time
    }));
};

const show_time_diologue = (index, time) => {
    $("#SaveTimeDialogue").modal("show");
    document.querySelector('#SaveTimeDialogueText').innerHTML = "Recorded Time: " + sec_to_time(time);

    document.querySelector('#SaveTimeButton').onclick = (e) => update_scene_time(index, time);
};
