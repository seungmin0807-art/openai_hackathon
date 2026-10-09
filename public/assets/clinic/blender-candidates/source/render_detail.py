"""A separate MCP render call keeps each call within the upstream socket timeout."""
import bpy
import json
from mathutils import Vector
OUT='C:/dev/openai_hackathon/artifacts/blender-mcp'
bpy.ops.wm.open_mainfile(filepath=OUT+'/clinic-station.blend')
scene=bpy.context.scene;hero=scene.camera
hero_loc=hero.location.copy();hero_rot=hero.rotation_euler.copy();hero_scale=hero.data.ortho_scale
hero.location=(1.57,-1.5,2.83)
target=Vector((.59,-.015,.994))
hero.rotation_euler=(target-hero.location).to_track_quat('-Z','Y').to_euler()
hero.data.ortho_scale=1.13
scene.render.resolution_x=900;scene.render.resolution_y=740
scene.cycles.samples=20
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.filepath=OUT+'/stethoscope-detail.png'
bpy.ops.render.render(write_still=True)
print(json.dumps({'phase':'detail-render-complete','path':scene.render.filepath}))
hero.location=hero_loc;hero.rotation_euler=hero_rot;hero.data.ortho_scale=hero_scale
scene.render.filepath=OUT+'/render.png'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/clinic-station.blend')
