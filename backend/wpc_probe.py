"""Temporary, bounded WPC provider test. Never uses account cookies."""
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile

URLS = {
    "Ug1mxpkX-ow": "https://www.youtube.com/watch?v=Ug1mxpkX-ow",
    "yMKXB4Js-sQ": "https://www.youtube.com/watch?v=yMKXB4Js-sQ",
}


def emit(data):
    print("WPC_PROBE " + json.dumps(data), flush=True)


def main():
    env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "TMPDIR") if k in os.environ}
    with tempfile.TemporaryDirectory(prefix="fetchly-wpc-") as directory:
        for video_id, url in URLS.items():
            result = {"event": "result", "videoId": video_id, "success": False,
                      "downloadedBytes": 0, "verifiedVideo": False, "verifiedAudio": False}
            log_path = Path(directory) / (video_id + ".log")
            out_template = str(Path(directory) / (video_id + ".%(ext)s"))
            args = ["/opt/media/bin/python", "-m", "yt_dlp", "--verbose", "--no-warnings",
                    "--no-playlist", "--no-progress", "--socket-timeout", "20",
                    "--retries", "1", "--extractor-retries", "1", "--max-filesize", "100M",
                    "--extractor-args", "youtube:player_client=mweb",
                    "--extractor-args", "youtubepot-wpc:browser_path=/usr/bin/chromium",
                    "-f", "bestvideo*+bestaudio/best", "--merge-output-format", "mp4",
                    "-o", out_template, url]
            emit({"event": "testing", "videoId": video_id, "provider": "wpc-1.1.2",
                  "client": "mweb", "accountCookies": False})
            try:
                with log_path.open("w+") as log:
                    proc = subprocess.Popen(args, env=env, stdout=log, stderr=subprocess.STDOUT,
                                            start_new_session=True)
                    try:
                        result["exitCode"] = proc.wait(timeout=180)
                    except subprocess.TimeoutExpired:
                        os.killpg(proc.pid, signal.SIGTERM)
                        try:
                            proc.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            os.killpg(proc.pid, signal.SIGKILL)
                            proc.wait()
                        raise
                    log.seek(0)
                    text = log.read(200000).lower()
                media = [p for p in Path(directory).glob(video_id + ".*") if p.suffix.lower() in (".mp4", ".mkv", ".webm")]
                if media:
                    file = media[0]
                    result["downloadedBytes"] = file.stat().st_size
                    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "stream=codec_type,width,height", "-of", "json", str(file)],
                        capture_output=True, text=True, timeout=15, env=env, check=False)
                    if probe.returncode == 0:
                        streams = json.loads(probe.stdout).get("streams", [])
                        result["verifiedVideo"] = any(s.get("codec_type") == "video" for s in streams)
                        result["verifiedAudio"] = any(s.get("codec_type") == "audio" for s in streams)
                        result["dimensions"] = [{k: s[k] for k in ("width", "height") if k in s}
                            for s in streams if s.get("codec_type") == "video"]
                    result["success"] = result["verifiedVideo"] and result["verifiedAudio"]
                indicators = {
                    "poTokenProviderSeen": "po token providers: wpc" in text or "wpc-1.1.2" in text,
                    "poTokenMinted": "po token" in text and ("generated" in text or "acquired" in text or "obtained" in text),
                    "http403": "http error 403" in text or "403 forbidden" in text,
                    "loginRequired": "sign in to confirm" in text or "login_required" in text or "confirm you’re not a bot" in text or "confirm you are not a bot" in text,
                    "unavailable": "video unavailable" in text or "video.unavailable" in text,
                    "browserError": any(x in text for x in ("chromium not found", "browser process", "failed to start", "nodriver")),
                }
                result["indicators"] = [k for k, value in indicators.items() if value]
            except subprocess.TimeoutExpired:
                result["failure"] = "timeout_180s"
            except Exception as exc:
                result["failure"] = type(exc).__name__
            emit(result)
    emit({"event": "finished"})


if __name__ == "__main__":
    main()
