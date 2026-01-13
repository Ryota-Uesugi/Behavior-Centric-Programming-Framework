import time
from logger import logger
from pymavlink import mavutil
from config import CONNECTION_STRING, MAVLINK_RECONNECT_INTERVAL

def connect(app):
    try:
        app.mavlink = mavutil.mavlink_connection(CONNECTION_STRING)
        # Log: Waiting for connection
        logger.info("Waiting for MAVLink connection...") 
        app.mavlink.wait_heartbeat(timeout=10)
        enable_streams(app.mavlink)
        # Log: Connection successful
        logger.info("MAVLink connection successful")
    except Exception:
        app.mavlink = None
        time.sleep(MAVLINK_RECONNECT_INTERVAL)
        # Log: Connection failed (with exception traceback)
        logger.exception("MAVLink connection failed")

def enable_streams(mav):
    streams = {
        mavutil.mavlink.MAV_DATA_STREAM_ALL: 10,
        mavutil.mavlink.MAV_DATA_STREAM_EXTRA1: 10,
        mavutil.mavlink.MAV_DATA_STREAM_EXTRA2: 5,
    }
    for sid, rate in streams.items():
        mav.mav.request_data_stream_send(
            mav.target_system,
            mav.target_component,
            sid,
            rate,
            1,
        )
        time.sleep(0.05)