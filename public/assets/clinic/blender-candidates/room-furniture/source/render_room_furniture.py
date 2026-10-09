"""Original MIT render utility. All furniture artwork CC0-1.0."""
import bpy
import json
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.filepath='C:/dev/openai_hackathon/artifacts/blender-mcp/room-furniture/render.png'
bpy.ops.wm.save_as_mainfile(filepath='C:/dev/openai_hackathon/artifacts/blender-mcp/room-furniture/room-furniture.blend')
bpy.ops.render.render(write_still=True)
print(json.dumps({'phase':'room-furniture-render-complete','size':[900,900],'samples':20,
    'blender_version':bpy.app.version_string,'path':scene.render.filepath,
    'assets':json.loads(scene['furniture_geometry_report'])}))
