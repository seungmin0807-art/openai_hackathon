"""Render the original trolley through the verified local Blender MCP. MIT."""
import bpy
import json
OUT='C:/dev/openai_hackathon/artifacts/blender-mcp/trolley'
PUBLIC='C:/dev/openai_hackathon/public/assets/clinic/blender-candidates/trolley'
scene=bpy.context.scene;scene.render.filepath=OUT+'/render.png';scene.cycles.samples=20
# Seat the isolation pads exactly between the counter and the removable tray.
asset=bpy.data.collections['TROLLEY_ASSET'];contact=[]
for obj in asset.objects:
    if obj.type=='MESH' and 'support pad' in obj.name:
        dz=max(v.co.z for v in obj.data.vertices)-min(v.co.z for v in obj.data.vertices)
        for vertex in obj.data.vertices:vertex.co.z*=.005/dz
        obj.location.z=.7905
        contact.append({'object':obj.name,'base_z_m':.788,'top_z_m':.793})
bpy.context.view_layer.update();depsgraph=bpy.context.evaluated_depsgraph_get()
temp=bpy.data.collections.new('TEMP_TROLLEY_EXPORT');scene.collection.children.link(temp)
root=bpy.data.objects.new('ClinicTrolley',None);temp.objects.link(root)
root['license']='CC0-1.0';root['source']='Original local Blender Python modelling';root['units']='metres';root['front_axis']='+Z in glTF'
for obj in asset.objects:
    if obj.type not in {'MESH','CURVE'}:continue
    evaluated=obj.evaluated_get(depsgraph);data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=depsgraph)
    copy=bpy.data.objects.new(obj.name,data);temp.objects.link(copy);copy.parent=root;copy.matrix_world=obj.matrix_world.copy()
    for key in obj.keys():copy[key]=obj[key]
bpy.ops.object.select_all(action='DESELECT')
for obj in temp.objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=PUBLIC+'/trolley.glb',export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
for obj in list(temp.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.collections.remove(temp)
bpy.ops.render.render(write_still=True)
scene['render_pending']=False
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/trolley.blend',compress=True)
print(json.dumps({'status':'trolley_cycles_rendered','render':OUT+'/render.png','resolution':[scene.render.resolution_x,scene.render.resolution_y],'samples':scene.cycles.samples,'tray_support_contact':contact,'audit':json.loads(scene['trolley_audit_json'])}))
