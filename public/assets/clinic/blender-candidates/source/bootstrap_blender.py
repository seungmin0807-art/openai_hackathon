"""Start the reviewed upstream add-on in a real Blender GUI event loop.

The GUI is launched hidden by the MCP wrapper. No background-mode patches.
"""
import os
import sys
from pathlib import Path

import bpy
import addon_utils

ROOT = Path(os.environ.get('MORI_BLENDER_WORK_DIR', str(Path(__file__).resolve().parent)))
PORT = int(os.environ.get('BLENDER_PORT', '9876'))
candidate = Path(os.environ.get('MORI_BLENDER_SCENE', str(ROOT / "clinic-station.blend")))
if candidate.exists():
    bpy.ops.wm.open_mainfile(filepath=str(candidate))

addon_utils.enable("blender_mcp_addon", default_set=True, persistent=True)
import blender_mcp_addon

for scene in bpy.data.scenes:
    scene.blendermcp_port = PORT
    scene.blendermcp_auto_start_server = True
    for name in ("polyhaven", "hyper3d", "hunyuan3d", "sketchfab", "tripo", "polypizza"):
        setattr(scene, "blendermcp_use_" + name, False)
prefs = blender_mcp_addon.get_blendermcp_addon_preferences()
if prefs:
    prefs.telemetry_consent = False
bpy.ops.wm.save_userpref()

# The existing upstream deferred startup sees this server and reuses it.
if not hasattr(bpy.types, "blendermcp_server"):
    bpy.types.blendermcp_server = blender_mcp_addon.BlenderMCPServer(host="127.0.0.1", port=PORT)
bpy.types.blendermcp_server.start()
bpy.context.scene.blendermcp_server_running = bpy.types.blendermcp_server.running
print("CLINIC_BLENDER_READY", bpy.app.version_string, flush=True)
