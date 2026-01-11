class AppState:
    def __init__(self):
        self.should_run = True
        self.websockets = set()
        self.current_state = {}
        self.mavlink = None
        self.cached_settings = []
        self.stream_active = False
        self.replay_finished = False
        self.mavlink_schema = {}
