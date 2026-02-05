import os
from enum import Enum, auto

# モード定義用のEnumクラス
class RunMode(Enum):
    MAVLINK = auto() # pymavlinkでテレメトリーを取る
    REPLAY = auto()  # jsonログを読む
    MATH = auto()    # 配信なし・評価ループのみ

class AppState:
    def __init__(self):
        self.should_run = True
        self.websockets = set()
        self.current_state = {}
        self.mavlink = None
        self.cached_settings = []
        self.cached_definition = []
        self.stream_active = False
        self.replay_finished = False
        self.mavlink_schema = {}

# ---------------------------------------------------------
# CONNECTION_STRING の設定
# ---------------------------------------------------------
# CONNECTION_STRING = "udp:192.168.4.2:14550"
#CONNECTION_STRING = "log_doron_Real.json"
CONNECTION_STRING = "math"                 

HTTP_HOST = "0.0.0.0"
HTTP_PORT = 5000

BROADCAST_INTERVAL = 0.03
MAVLINK_RECONNECT_INTERVAL = 5.0

LOG_DIR = "logs_ws"
SETTING_DIR = "settings"
SETTING_FILE = "setting.json"
DEFINITION_FILE = "definition.json"
REFERENCE_FILE = "reference.json"

os.makedirs(LOG_DIR, exist_ok=True)

# ---------------------------------------------------------
# モード判定ロジック
# ---------------------------------------------------------
def get_run_mode(conn_str: str) -> RunMode:
    conn_str_lower = conn_str.lower()
    
    # "math" が指定されたら Math Mode
    if conn_str_lower == "math":
        return RunMode.MATH
    
    # ".json" で終わる場合は Replay Mode
    if conn_str_lower.endswith(".json"):
        return RunMode.REPLAY
    
    # それ以外は Mavlink Mode
    return RunMode.MAVLINK

# 現在の実行モードを決定
CURRENT_RUN_MODE = get_run_mode(CONNECTION_STRING)