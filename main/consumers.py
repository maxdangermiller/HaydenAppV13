import json
from asgiref.sync import async_to_sync
from channels.generic.websocket import WebsocketConsumer
from .models import *


scene_names = list([])
scene_est_times = list([])

# Prologue, Belle, Belle Playoff


class ChatConsumer(WebsocketConsumer):
    """
    ChatConsumer: WebSocket consumer for managing real-time communication in the Hayden Auditorium system.
    This consumer handles WebSocket connections and manages scene information, display configurations,
    RFID authentication, and tamper alerts across connected displays.
    Attributes:
        commands (dict): Mapping of command names to their corresponding handler methods.
        scene_names (list): Global list of scene names ordered by index.
        scene_est_times (list): Global list of estimated times for each scene.
    Methods:
        connect(): Establishes WebSocket connection, joins the "main" group, and loads scene list.
        disconnect(code): Closes WebSocket connection and removes client from the "main" group.
        receive(text_data, bytes_data): Parses incoming JSON data and routes to appropriate command handler.
        admin_send_update_message(data): Sends current, next, and after scene information to all clients.
        new_message(message): Broadcasts scene location update to all connected clients.
        get_length_of_list(message): Returns the total number of scenes to the requesting client.
        ask_admin_for_current_increment(message): Requests admin to increment the current scene.
        get_list(message): Sends the complete scene list to the requesting client.
        get_connected_displays(message): Broadcasts a request to report connected displays.
        set_connected_display(message): Updates connected display status across all clients.
        updateDisplayModel(message): Creates or updates display configuration records in the database.
        rfid_auth(message): Authenticates RFID data and responds with success status.
        send_tamper_alert(message): Broadcasts a tamper alert for a specific display.
        UpdateLocation(event): WebSocket event handler that sends scene location updates to client.
        adminCurrentIncrement(event): WebSocket event handler requesting admin increment.
        connectedDisplays(event): WebSocket event handler for connected displays query.
        connectedDisplay(event): WebSocket event handler for individual display connection status.
        tamperAlert(event): WebSocket event handler for tamper alert broadcasts.
        updateSceneList(): Refreshes the global scene list from the database, padding with empty entries.
    """

    def admin_send_update_message(self, data):
        """
        Sends an update message to the "main" channel group with information about the current, next, and after scenes,
        as well as the estimated time for the current scene.
        Args:
            data (dict): A dictionary containing at least the "index" key, which specifies the current scene index.
        Side Effects:
            - Calls self.updateSceneList() to refresh the scene list.
            - Sends a message to the "main" channel group with the following keys:
                - 'current': Name of the current scene (str).
                - 'next': Name of the next scene (str).
                - 'after': Name of the scene after next (str).
                - 'est': Estimated time for the current scene (int, -1 if unavailable).
        Notes:
            - If the index is out of bounds, empty strings and -1 are sent for the scene names and estimated time.
            - Uses async_to_sync to send the message synchronously.
        """
        global scene_names
        self.updateSceneList()

        index = int(data["index"])

        # Current
        try:
            _current = scene_names[index]
            _est = scene_est_times[index]
        except IndexError:
            _current = ""
            _est = -1

        # Next
        try:
            _next = scene_names[index + 1]
        except IndexError:
            _next = ""

        # After
        try:
            _after = scene_names[index + 2]
        except IndexError:
            _after = ""
        
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
        self.send(text_data=json.dumps({"type": "get_length_of_list", "value": len(scene_names) - 2}))


    def ask_admin_for_current_increment(self, message):
        async_to_sync(self.channel_layer.group_send)(
            "main",
            {'type': 'adminCurrentIncrement'},
        )


    def get_list(self, message):
        self.send(text_data=json.dumps({
            'type': 'get_list',
            'data': scene_names,
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
        configs = json.loads(message['configs'])
        
        for config in configs:
            try:
                existingConfig = NewDisplayConfig.objects.get(display_number = config['display_number'])
                existingConfig.name = config['name']
                existingConfig.play_sound = config['play_sound']
                existingConfig.save()
            except NewDisplayConfig.DoesNotExist:
                newConfig = NewDisplayConfig(
                    name=config['name'],
                    play_sound=config['play_sound'],
                    display_number=config['display_number']
                )
                newConfig.save()

        
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
    

    def update_scene_time(self, message):
        scene_index = message['scene_index']
        new_time = message['new_time']

        try:
            scene = Scene.objects.get(index=scene_index)
            scene.est_time = new_time
            scene.save()

            # Update the global list
            global scene_est_times
            scene_est_times[scene_index] = new_time

            print(f"Updated scene {scene_index} estimated time to {new_time} seconds.")
        except Scene.DoesNotExist:
            print(f"Scene with index {scene_index} does not exist. Cannot update estimated time.")


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
        'update_scene_time': update_scene_time
    }


    def connect(self):
        self.updateSceneList()
        
        async_to_sync(self.channel_layer.group_add)("main", self.channel_name)
        self.accept()


    def disconnect(self, code):
        async_to_sync(self.channel_layer.group_discard)("main", self.channel_name)


    def receive(self, text_data:str, bytes_data=None): # type: ignore
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

    
    def updateSceneList(self):
        global scene_names, scene_est_times
        try:
            sceneList = Scene.objects.all().order_by('index')

            scene_names.clear()
            scene_est_times.clear()
            
            for scene in sceneList:
                scene_names.append(scene.name)
                scene_est_times.append(scene.est_time)
            
            # Pad the list to avoid index errors
            scene_names.append("")
            scene_names.append("")
            scene_est_times.append(-1)
            scene_est_times.append(-1)

            return list(sceneList)


        except IndexError:
            scene_names = ["", "", ""]
    
        return None