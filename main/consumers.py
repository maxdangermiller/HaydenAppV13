import json
from asgiref.sync import async_to_sync
from channels.generic.websocket import WebsocketConsumer
from .models import *


Mapping = list(["hello", "World", "I", "Like", "Bananas", "", ""])
Est_Times = list([5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])


class ChatConsumer(WebsocketConsumer):

    def admin_send_update_message(self, data):
        global Mapping

        sceneList = SceneList.objects.get(id=1)
        Mapping.clear()
        for word in sceneList.sceneList.split(","):
            Mapping.append(word)

        index = int(data["index"])
        Simple = True
        if not Simple:
            if len(Mapping) > index:
                _current = Mapping[index]
                try:
                    _est = Est_Times[index]
                except IndexError:
                    _est = 0
                if len(Mapping) > index + 1:
                    _next = Mapping[index + 1]
                    if len(Mapping) > index + 2:
                        _after = Mapping[index + 2]
                    else:
                        _after = ""
                else:
                    _next = ""
                    _after = ""
            else:
                _current = ""
                _next = ""
                _after = ""
                _est = 0
        else:
            if len(Mapping) > index:
                _current = Mapping[index]
                _next = Mapping[index + 1]
                _after = Mapping[index + 2]
                _est = Est_Times[index]
            else:
                _current = ""
                _next = ""
                _after = ""
                _est = 0
        async_to_sync(self.channel_layer.group_send)(
            "main",
            {'type': 'UpdateLocation', 'current': _current, 'next': _next, 'after': _after, 'est': _est},
        )

    def new_message(self, message):
        _current = message['current']
        _next = message['next']
        _after = message['after']

        async_to_sync(self.channel_layer.group_send)(
            "main",
            {'type': 'UpdateLocation', 'current': _current, 'next': _next, 'after': _after},
        )

    def get_length_of_list(self, message):
        self.send(text_data=json.dumps({"type": "get_length_of_list", "value": len(Mapping) - 2}))

    def ask_admin_for_current_increment(self, message):
        async_to_sync(self.channel_layer.group_send)(
            "main",
            {'type': 'adminCurrentIncrement'},
        )

    def get_list(self, message):
        self.send(text_data=json.dumps({
            'type': 'get_list',
            'data': Mapping,
        }))

    def get_connected_displays(self, message):
        async_to_sync(self.channel_layer.group_send)(
            "main",
            {'type': 'connectedDisplays'},
        )

    def set_connected_display(self, message):
        async_to_sync(self.channel_layer.group_send)(
            "main",
            {'type': 'connectedDisplay', 'display': message['display'], 'is_protected': message['is_protected']},
        )

    def updateDisplayModel(self, message):
        configName1 = message['configName1']
        configSound1 = message['configSound1']
        configName2 = message['configName2']
        configSound2 = message['configSound2']
        configName3 = message['configName3']
        configSound3 = message['configSound3']
        configName4 = message['configName4']
        configSound4 = message['configSound4']
        configName5 = message['configName5']
        configSound5 = message['configSound5']
        configName6 = message['configName6']
        configSound6 = message['configSound6']

        config = DisplayConfig.objects.get(id=1)
        config.display_one_name = configName1
        config.display_one_play_sound = configSound1

        config.display_two_name = configName2
        config.display_two_play_sound = configSound2

        config.display_three_name = configName3
        config.display_three_play_sound = configSound3

        config.display_four_name = configName4
        config.display_four_play_sound = configSound4

        config.display_five_name = configName5
        config.display_five_play_sound = configSound5

        config.display_six_name = configName6
        config.display_six_play_sound = configSound6

        config.save()
        print("Saved Config!")

    def rfid_auth(self, message):
        try:
            data = RFIDData.objects.get(RFID=message['rfid'])
            if data is not None:
                self.send(text_data=json.dumps({
                    'type': 'rfid_auth',
                    'success': True,
                }))
            else:
                self.send(text_data=json.dumps({
                    'type': 'rfid_auth',
                    'success': False,
                }))
        except:
            self.send(text_data=json.dumps({
                'type': 'rfid_auth',
                'success': False,
            }))

    def send_tamper_alert(self, message):
        async_to_sync(self.channel_layer.group_send)(
            "main",
            {'type': 'tamperAlert', 'display': message['display']},
        )

    commands = {
        'admin_send_update_message': admin_send_update_message,
        'new_message': new_message,
        'get_length_of_list': get_length_of_list,
        'ask_admin_for_current_increment': ask_admin_for_current_increment,
        'get_list': get_list,
        'get_connected_displays': get_connected_displays,
        'set_connected_display': set_connected_display,
        'updateDisplayModel': updateDisplayModel,
        'rfid_auth': rfid_auth,
        'send_tamper_alert': send_tamper_alert,
    }

    def connect(self):
        global Mapping

        sceneList = SceneList.objects.get(id=1)
        Mapping.clear()
        for word in sceneList.sceneList.split(","):
            Mapping.append(word)
        
        async_to_sync(self.channel_layer.group_add)("main", self.channel_name)
        self.accept()

    def disconnect(self, close_code):
        async_to_sync(self.channel_layer.group_discard)("main", self.channel_name)

    def receive(self, text_data):
        text_data_json = json.loads(text_data)
        self.commands[text_data_json['command']](self, text_data_json)

    def UpdateLocation(self, event):
        _current = event['current']
        _next = event['next']
        _after = event['after']
        _est = event['est']

        # Send message to WebSocket
        # print(json.dumps({'current': _current, 'next': _next, 'after': _after}))
        self.send(text_data=json.dumps({'type': 'UpdateLocation', 'current': _current, 'next': _next, 'after': _after, 'est': _est}))

    def adminCurrentIncrement(self, event):
        self.send(text_data=json.dumps({'type': 'ask_admin_for_current_increment'}))

    def connectedDisplays(self, event):
        self.send(text_data=json.dumps({'type': 'connectedDisplays'}))

    def connectedDisplay(self, event):
        self.send(text_data=json.dumps({'type': 'connectedDisplay', 'display': event['display'], 'is_protected': event['is_protected']}))

    def tamperAlert(self, event):
        self.send(text_data=json.dumps({'type': 'tamperAlert', 'display': event['display']}))
