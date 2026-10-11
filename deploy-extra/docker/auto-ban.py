import os
import re
import time
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path

LOG_PATH = Path("/var/log/nginx/access.log")
BLACKLIST_DIR = Path("/var/lib/nginx-blacklist")
BLACKLIST_FILE = BLACKLIST_DIR / "blacklist.map"

WINDOW_SEC = int(os.getenv("AUTOBAN_WINDOW_SEC", "300"))
THRESHOLD = int(os.getenv("AUTOBAN_THRESHOLD", "12"))
SUSPICIOUS_THRESHOLD = int(os.getenv("AUTOBAN_SUSPICIOUS_THRESHOLD", "4"))
BAN_TTL_SEC = int(os.getenv("AUTOBAN_TTL_SEC", "86400"))

SUSPICIOUS_PATTERNS = re.compile(
    r"/(wp-login\.php|xmlrpc\.php|phpmyadmin|pma|admin(?:/|$)|private/login\.php|\.env(?:\.|$)|api/ws/|\.git|\.svn|\.bak|\.sql|\.zip|\.tar|\.gz)",
    re.IGNORECASE,
)

log_re = re.compile(r'^(?P<ip>\S+) - - \[(?P<time>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+) \S+" (?P<status>\d{3}) ')
log_time_fmt = "%d/%b/%Y:%H:%M:%S %z"

BLACKLIST_DIR.mkdir(parents=True, exist_ok=True)
if not BLACKLIST_FILE.exists():
    BLACKLIST_FILE.write_text("", encoding="utf-8")

events = defaultdict(deque)
ban_until = {}


def parse_line(line: str):
    m = log_re.search(line)
    if not m:
        return None
    data = m.groupdict()
    try:
        data["ts"] = int(datetime.strptime(data["time"], log_time_fmt).timestamp())
    except Exception:
        data["ts"] = int(time.time())
    return data


def is_suspicious(path: str) -> bool:
    return bool(SUSPICIOUS_PATTERNS.search(path or ""))


def rewrite_blacklist():
    now = int(time.time())
    entries = []
    for ip, until in list(ban_until.items()):
        if until <= now:
            del ban_until[ip]
            continue
        entries.append(f"{ip} 1;")
    content = "\n".join(entries) + ("\n" if entries else "")
    BLACKLIST_FILE.write_text(content, encoding="utf-8")


def should_ban(ip: str, now: int) -> bool:
    q = events[ip]
    while q and q[0] < now - WINDOW_SEC:
        q.popleft()
    if len(q) >= THRESHOLD:
        return True
    suspicious = sum(1 for ts in q if ts >= now - WINDOW_SEC and ts > 0)
    return suspicious >= SUSPICIOUS_THRESHOLD and len(q) >= max(6, SUSPICIOUS_THRESHOLD)


def follow():
    while not LOG_PATH.exists():
        time.sleep(1)
    with LOG_PATH.open("r", encoding="utf-8", errors="ignore") as f:
        for _ in f:
            pass
        while True:
            line = f.readline()
            if not line:
                time.sleep(0.5)
                continue
            data = parse_line(line)
            if not data:
                continue
            ip = data["ip"]
            path = data["path"]
            status = int(data["status"])
            now = data["ts"]

            if now < int(time.time()) - WINDOW_SEC:
                continue

            score = 1
            if status in (401, 403, 404, 405, 406, 444, 499):
                score += 1
            if is_suspicious(path):
                score += 2

            events[ip].append(now)
            if score >= 2:
                events[ip].append(now)
            if is_suspicious(path) and status in (404, 403):
                events[ip].append(now)

            if ip in ban_until:
                continue

            if should_ban(ip, now):
                ban_until[ip] = now + BAN_TTL_SEC
                rewrite_blacklist()
                print(f"[autoban] banned {ip} until {ban_until[ip]}", flush=True)


if __name__ == "__main__":
    rewrite_blacklist()
    follow()