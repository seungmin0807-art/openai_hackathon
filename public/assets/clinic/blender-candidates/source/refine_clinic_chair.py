"""Join footrest braces into the seat frame; export with its pickup origin on the floor."""
import bpy
from mathutils import Vector
root=bpy.data.objects['ClinicChair']
root.location=(0,0,0)
for obj in bpy.data.collections['CLINIC_CHAIR_ASSET'].objects:
    if obj.name.startswith('Chair | footrest brace'):
        x=obj.location.x
        a=Vector((x,-.10,.581));b=Vector((x,-.325,.212))
        length=(b-a).length
        old=max(v.co.z for v in obj.data.vertices)-min(v.co.z for v in obj.data.vertices)
        for v in obj.data.vertices:v.co.z*=length/old
        obj.data.update()
        obj.location=(a+b)/2
        obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.collections['CLINIC_CHAIR_ASSET'].objects:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath='C:/dev/openai_hackathon/public/assets/clinic/blender-candidates/clinic-chair.glb',
    export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_animations=False)
root.location=(-.78,-1.06,0)
bpy.ops.wm.save_as_mainfile(filepath='C:/dev/openai_hackathon/artifacts/blender-mcp/clinic-chair-scene.blend')
print('Footrest braces attached to the seat-support frame; source and GLB updated.')
