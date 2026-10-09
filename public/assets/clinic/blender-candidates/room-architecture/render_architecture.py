"""Actual Cycles render via the local MCP. Original script MIT."""
import bpy
import json
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=20
scene.cycles.use_denoising=True
scene.render.resolution_x=1000
scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.render.filepath='C:/dev/openai_hackathon/artifacts/blender-mcp/room-architecture/render.png'
bpy.ops.render.render(write_still=True)
print(json.dumps({'phase':'architecture_render_complete','path':scene.render.filepath}))
