"""Original exam chair. MIT script; CC0-1.0 geometry. Meters, Blender Z-up."""
import bpy
import json
from mathutils import Vector

OUT='C:/dev/openai_hackathon/artifacts/blender-mcp'
PUBLIC='C:/dev/openai_hackathon/public/assets/clinic/blender-candidates'
collection=bpy.data.collections.new('CLINIC_CHAIR_ASSET')
bpy.context.scene.collection.children.link(collection)
root=bpy.data.objects.new('ClinicChair',None);collection.objects.link(root)
root['license']='CC0-1.0';root['seat_top_m']=.675;root['role']='exam-chair'

def finish(obj,name,material,bevel):
    obj.name=name
    for c in list(obj.users_collection):c.objects.unlink(obj)
    collection.objects.link(obj);obj.parent=root
    obj.data.materials.append(bpy.data.materials[material])
    mod=obj.modifiers.new('Soft manufactured edge','BEVEL');mod.width=bevel;mod.segments=6
    obj.modifiers.new('Surface normals','WEIGHTED_NORMAL')
    for p in obj.data.polygons:p.use_smooth=True
    return obj

def box(name,position,size,material,bevel):
    bpy.ops.mesh.primitive_cube_add(size=1,location=position)
    obj=bpy.context.object;obj.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,name,material,bevel)

def cylinder(name,position,radius,depth,material,bevel):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=radius,depth=depth,location=position)
    return finish(bpy.context.object,name,material,bevel)

def beam(name,a,b,radius):
    v=Vector(b)-Vector(a)
    obj=cylinder(name,(Vector(a)+Vector(b))/2,radius,v.length,'Metal | brushed stainless steel',.004)
    obj.rotation_euler=v.to_track_quat('Z','Y').to_euler()
    return obj

box('Chair | grounded rubber base',(0,.07,.018),(.67,.58,.036),'Rubber | forest green',.017)
box('Chair | stable enamel base',(0,.07,.049),(.65,.56,.041),'Cabinet | warm porcelain',.020)
cylinder('Chair | pedestal',(0,.075,.316),.061,.496,'Cabinet | warm porcelain',.01)
cylinder('Chair | telescoping column',(0,.075,.49),.037,.29,'Metal | polished chrome',.005)
box('Chair | seat support',(0,0,.584),(.42,.38,.034),'Cabinet | warm porcelain',.016)
box('Chair | upholstered seat',(0,0,.628),(.59,.51,.094),'Cabinet | jade enamel',.043)
box('Chair | seat seam',(0,-.22,.624),(.46,.016,.006),'Cabinet | warm porcelain',.003)
for x in [-.22,.22]:
    beam('Chair | backrest upright',(x,.185,.584),(x,.25,1.148),.018)
back=box('Chair | padded backrest',(0,.262,1.061),(.535,.107,.646),'Cabinet | jade enamel',.05)
back.rotation_euler=(.07,0,0)
box('Chair | backrest seam',(0,.196,1.328),(.38,.008,.006),'Cabinet | warm porcelain',.003)
for x in [-.16,.16]:
    beam('Chair | footrest brace',(x,-.10,.581),(x,-.325,.212),.015)
box('Chair | footrest enamel',(0,-.385,.192),(.46,.25,.034),'Cabinet | warm porcelain',.016)
box('Chair | nonslip footrest',(0,-.385,.216),(.415,.213,.014),'Rubber | forest green',.006)
for x in [-.14,-.07,0,.07,.14]:
    box('Chair | nonslip groove',(x,-.385,.224),(.005,.165,.0015),'Cabinet | jade enamel',.0005)
bpy.ops.object.select_all(action='DESELECT')
for obj in collection.objects:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=PUBLIC+'/clinic-chair.glb',export_format='GLB',use_selection=True,
    export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/clinic-chair-scene.blend')
print(json.dumps({'phase':'chair-exported','objects':len(collection.objects),'seat_top_m':.675,'footrest_top_m':.224}))
