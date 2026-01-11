import os

#CONNECTION_STRING = "udp:192.168.4.2:14550"
#CONNECTION_STRING = "udpin:0.0.0.0:14550"
CONNECTION_STRING = "log_doron_Real.json"

HTTP_HOST = "0.0.0.0"
HTTP_PORT = 5000

BROADCAST_INTERVAL = 0.03
MAVLINK_RECONNECT_INTERVAL = 5.0

LOG_DIR = "logs_ws"
SETTING_FILE = "setting.json"

os.makedirs(LOG_DIR, exist_ok=True)

IS_REPLAY_MODE = CONNECTION_STRING.lower().endswith(".json")
