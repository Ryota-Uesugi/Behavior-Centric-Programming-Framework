import logging
from logging.handlers import RotatingFileHandler
import os

LOG_DIR = "logs"
LOG_FILE = os.path.join(LOG_DIR, "server.log")

os.makedirs(LOG_DIR, exist_ok=True)

logger = logging.getLogger("server")
logger.setLevel(logging.INFO)

handler = RotatingFileHandler(
    LOG_FILE,
    maxBytes=5 * 1024 * 1024,  # 5MB
    backupCount=5,
    encoding="utf-8"
)

formatter = logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

handler.setFormatter(formatter)
logger.addHandler(handler)
