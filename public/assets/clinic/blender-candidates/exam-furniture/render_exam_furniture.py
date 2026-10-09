"""Render the four original furniture candidates via local Blender MCP. MIT."""
import bpy
import json
OUT='C:/dev/openai_hackathon/artifacts/blender-mcp/exam-furniture'
scene=bpy.context.scene;scene.render.filepath=OUT+'/render.png';scene.cycles.samples=20
bpy.ops.render.render(write_still=True)
scene['render_complete']=True
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/exam-furniture.blend',compress=True)
print(json.dumps({'status':'four_furnishings_cycles_rendered','render':OUT+'/render.png','pixels':[scene.render.resolution_x,scene.render.resolution_y],'samples':20,'audit':json.loads(scene['furniture_audit_json'])}))
