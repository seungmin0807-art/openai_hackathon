"""Render the original chair on the clinic studio floor, then restore furniture."""
import bpy
import json
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath='C:/dev/openai_hackathon/artifacts/blender-mcp/clinic-chair-scene.blend')
scene=bpy.context.scene
hidden=[(o,o.hide_render) for o in bpy.data.collections['CLINIC_STATION_ASSET'].objects]
for obj,_ in hidden:obj.hide_render=True
chair=bpy.data.objects['ClinicChair']
chair.location=(-.78,-1.06,0)
cam=scene.camera
cam.location=(1.02,-3.10,2.16)
target=Vector((-.78,-1.05,.77))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.ortho_scale=1.78
scene.render.resolution_x=850;scene.render.resolution_y=950
scene.cycles.samples=16;scene.cycles.max_bounces=5
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.view_settings.exposure=-.3
scene.render.filepath='C:/dev/openai_hackathon/artifacts/blender-mcp/chair-render.png'
bpy.ops.render.render(write_still=True)
print(json.dumps({'phase':'chair-render-complete','path':scene.render.filepath}))
for obj,was_hidden in hidden:obj.hide_render=was_hidden
bpy.ops.wm.save_as_mainfile(filepath='C:/dev/openai_hackathon/artifacts/blender-mcp/clinic-chair-scene.blend')
