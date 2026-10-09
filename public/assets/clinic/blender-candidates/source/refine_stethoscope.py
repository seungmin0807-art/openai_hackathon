import bpy
spring=bpy.data.objects['Stethoscope | binaural spring']
z=.989
for point,co in zip(spring.data.splines[0].bezier_points,[(.346,.011,z),(.319,-.027,z),(.319,-.120,z),(.348,-.170,z)]):
    point.co=co
"""Export evaluated meshes, retain editable source, then render tool detail.
Original code MIT; original geometry CC0-1.0. No external assets or APIs.
"""
import bpy
import bmesh
import json
from mathutils import Vector, Matrix

OUT='C:/dev/openai_hackathon/artifacts/blender-mcp'
PUBLIC='C:/dev/openai_hackathon/public/assets/clinic/blender-candidates'
scene=bpy.context.scene
source=bpy.data.collections['CLINIC_STATION_ASSET']

# Correct orientation even if the first submitted script preceded the source correction.
for name in ['Tray | connected rolled steel shell','Sink | continuous bowl']:
    obj=bpy.data.objects[name]
    floor=next(p for p in obj.data.polygons if len(p.vertices)>4)
    if floor.normal.z<0:
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
        bm.to_mesh(obj.data);bm.free();obj.data.update()

# Validate both sheet-metal surfaces after Solidify, including normals and connectivity.
depsgraph=bpy.context.evaluated_depsgraph_get()
audit=[]
for name in ['Tray | connected rolled steel shell','Sink | continuous bowl']:
    obj=bpy.data.objects[name]
    bm=bmesh.new();bm.from_object(obj,depsgraph)
    pending=set(bm.verts);components=0
    while pending:
        components+=1;stack=[pending.pop()]
        while stack:
            for edge in stack.pop().link_edges:
                for v in edge.verts:
                    if v in pending:
                        pending.remove(v);stack.append(v)
    audit.append({'object':name,'connected_components':components,
        'non_manifold_edges':sum(not e.is_manifold for e in bm.edges),
        'vertices':len(bm.verts),'faces':len(bm.faces)})
    bm.free()
assert all(a['connected_components']==1 and a['non_manifold_edges']==0 for a in audit)

hero=scene.camera
hero_loc=hero.location.copy();hero_rot=hero.rotation_euler.copy();hero_scale=hero.data.ortho_scale

# Export evaluated geometry without destructively applying the editable source modifiers.
export_collection=bpy.data.collections.new('TEMP_GLTF_EXPORT')
scene.collection.children.link(export_collection)
root=bpy.data.objects.new('ClinicStation',None)
export_collection.objects.link(root)
root['license']='CC0-1.0'
root['units']='meters'
root['source']='Original local Blender Python modelling; no downloaded geometry'
groups={}
origin=Vector((.57,-.06,.989))
for label in ['Cabinet','Countertop','Sink','Faucet','Soap','Tray','Stethoscope','Backsplash','Shelf','Supplies','Exam light','Waste bin','Wall']:
    group=bpy.data.objects.new(label,None);export_collection.objects.link(group);group.parent=root
    if label=='Stethoscope':
        group.location=origin
        group['selectable_tool']='stethoscope';group['display_pose']='lying-flat'
    groups[label]=group
bpy.context.view_layer.update()
copies=[];triangles=0
for obj in source.objects:
    if obj.type not in {'MESH','CURVE','FONT'}:
        continue
    evaluated=obj.evaluated_get(depsgraph)
    mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=depsgraph)
    copy=bpy.data.objects.new(obj.name+' | exported',mesh)
    export_collection.objects.link(copy)
    group=groups[obj.name.split(' | ')[0]]
    copy.parent=group
    copy.matrix_world=obj.matrix_world.copy()
    for key in obj.keys():
        copy[key]=obj[key]
    copies.append(copy)
    mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in export_collection.objects:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=PUBLIC+'/clinic-station.glb',export_format='GLB',use_selection=True,
    export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
station_count=len(copies)

# A standalone pickup tool is centered at the tubing junction/loop midpoint.
tool_collection=bpy.data.collections.new('TEMP_TOOL_EXPORT')
scene.collection.children.link(tool_collection)
tool_root=bpy.data.objects.new('StethoscopePickup',None);tool_collection.objects.link(tool_root)
tool_root['selectable_tool']='stethoscope';tool_root['license']='CC0-1.0'
tool_objects=[]
for obj in copies:
    if obj.parent==groups['Stethoscope']:
        copy=bpy.data.objects.new(obj.name,obj.data.copy());tool_collection.objects.link(copy)
        copy.parent=tool_root;copy.matrix_world=Matrix.Translation(-origin)@obj.matrix_world
        for key in obj.keys():copy[key]=obj[key]
        tool_objects.append(copy)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in tool_collection.objects:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=PUBLIC+'/stethoscope.glb',export_format='GLB',use_selection=True,
    export_extras=True,export_cameras=False,export_lights=False,export_animations=False)

# Delete only temporary evaluated copies, keeping the .blend source editable.
for collection in [export_collection,tool_collection]:
    for obj in list(collection.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(collection)
print(json.dumps({'phase':'glb-exported','meshes':station_count,'triangles':triangles,
    'topology_audit':audit,'tool_parts':len(tool_objects)}))


bpy.ops.wm.save_as_mainfile(filepath=OUT+'/clinic-station.blend')
print('Spring is physically attached to both steel binaurals; exports refreshed.')
