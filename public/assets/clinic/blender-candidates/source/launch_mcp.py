"""Codex stdio entry point; starts/reuses the loopback Blender add-on."""
import os
import logging
import socket
import subprocess
import sys
import time
import msvcrt
from contextlib import contextmanager
from pathlib import Path

LAUNCH_DIR = Path(__file__).resolve().parent
ROOT = Path(os.environ.get('MORI_BLENDER_WORK_DIR', str(LAUNCH_DIR)))
PORT = int(os.environ.get('BLENDER_PORT', '9876'))
BLENDER_DIR = Path.home() / "AppData/Local/Programs/Blender Foundation/blender-4.5.14-windows-x64"
os.environ.update({
    "DISABLE_TELEMETRY": "true",
    "BLENDERMCP_NO_UPDATE_CHECK": "1",
    "BLENDER_HOST": "127.0.0.1",
    "BLENDER_PORT": str(PORT),
    "BLENDER_MCP_SAFE_MODE": "1",
    "BLENDERMCP_ADDONS_DIR": str(BLENDER_DIR / "portable/scripts/addons"),
    "BLENDER_USER_SCRIPTS": str(BLENDER_DIR / "portable/scripts"),
    "BLENDER_USER_CONFIG": str(BLENDER_DIR / ('portable/config' if PORT == 9876 else 'portable/config-' + str(PORT))),
    "PYTHONUTF8": "1",
})

@contextmanager
def startup_lock():
    # Every Codex chat can start its own stdio server at the same time.
    # Serialize only Blender startup, globally per port, so they reuse one GUI.
    locks=Path.home()/"AppData/Local/MoriBlenderMCP/runtime/locks"
    locks.mkdir(parents=True,exist_ok=True)
    with (locks/f"blender-{PORT}.lock").open('a+b') as handle:
        if handle.seek(0,2)==0:
            handle.write(b'\0');handle.flush()
        for _ in range(240):
            handle.seek(0)
            try:
                msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
                break
            except OSError:
                time.sleep(.25)
        else:
            raise TimeoutError('Another Blender startup did not finish within 60 seconds')
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1)

def listening():
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=0.4):
            return True
    except OSError:
        return False

def ensure_blender():
    if listening():
        return
    runtime = ROOT / "runtime"
    runtime.mkdir(exist_ok=True)
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = subprocess.SW_HIDE
    with (runtime / "blender.log").open("a", encoding="utf-8") as log:
        proc = subprocess.Popen(
            [str(BLENDER_DIR / "blender.exe"), "--factory-startup", "--python", str(LAUNCH_DIR / "bootstrap_blender.py")],
            cwd=ROOT, env=os.environ.copy(), stdout=log, stderr=log,
            startupinfo=startup, creationflags=subprocess.CREATE_NO_WINDOW,
        )
    (runtime / "blender-pid.txt").write_text(str(proc.pid), encoding="utf-8")
    for _ in range(160):
        if listening():
            break
        if proc.poll() is not None:
            raise RuntimeError("Blender exited; inspect runtime/blender.log")
        time.sleep(0.25)
    else:
        raise TimeoutError("Blender socket did not start within 40 seconds")

with startup_lock():
    ensure_blender()

logging.basicConfig(level=logging.WARNING)
from blender_mcp.server import main
main()
