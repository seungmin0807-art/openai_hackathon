"""Original local diagnostic instrument meshes. Code MIT; artwork CC0-1.0.

No downloaded assets, texture/model service, image API, or external generation.
Run with the reviewed local Blender MCP execute_blender_code tool.
"""
import bpy
import bmesh
import math
import json
from mathutils import Vector, Matrix

OUT='C:/dev/openai_hackathon/artifacts/blender-mcp/instruments'
PUBLIC='C:/dev/openai_hackathon/public/assets/clinic/blender-candidates/instruments'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name.startswith('CLINIC_INSTRUMENTS_ASSET') or collection.name.startswith('STUDIO_ONLY'):
        bpy.data.collections.remove(collection)
for m in list(bpy.data.materials):bpy.data.materials.remove(m)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
asset=bpy.data.collections.new('CLINIC_INSTRUMENTS_ASSET');scene.collection.children.link(asset)
studio=bpy.data.collections.new('STUDIO_ONLY');scene.collection.children.link(studio)
parts=[]

def material(name,color,rough=.4,metal=0):
    rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)]
    rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*rgb,1);mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=mat.diffuse_color
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return mat

steel=material('Steel | satin brushed', 'CED8D5', .27, .93)
anisotropy=steel.node_tree.nodes.get('Principled BSDF').inputs.get('Anisotropic')
if anisotropy:anisotropy.default_value=.35
polish=material('Steel | polished edge', 'E3E8E4', .18, .96)
ivory=material('Polymer | warm medical ivory', 'EFEDE0', .40)
mint=material('Polymer | eucalyptus', '75A995', .42)
dark=material('Elastomer | deep green', '254B40', .63)
black=material('Speculum | charcoal', '182923', .43)
groove=material('Groove | green shadow', '1D3A31', .71)
lcd=material('LCD | neutral inactive glass', 'AEBCAF', .36)
glass=material('Lens | clear glass', 'D1E5DF', .12)
glass.node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value=.52
glass.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value=1.46
led=material('LED | off white', 'FAF6DD', .35)
floor_mat=material('Studio | jade paper', 'C6D7CB', .85)

def organize(obj,col=asset):
    for c in list(obj.users_collection):c.objects.unlink(obj)
    col.objects.link(obj);return obj

def mesh(name,vs,fs,mat,parent=None,sub=0):
    data=bpy.data.meshes.new(name+' mesh');data.from_pydata(vs,[],fs);data.update()
    bm=bmesh.new();bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    o=bpy.data.objects.new(name,data);asset.objects.link(o);o.data.materials.append(mat)
    for p in data.polygons:p.use_smooth=True
    if sub:
        mod=o.modifiers.new('Smooth manufactured surface','SUBSURF');mod.levels=sub;mod.render_levels=sub
    o.parent=parent;o['license']='CC0-1.0';parts.append(o)
    return o

def root(name,tool_id):
    o=bpy.data.objects.new(name,None);asset.objects.link(o)
    o['tool_id']=tool_id;o['selectable_tool']=tool_id;o['license']='CC0-1.0'
    o['pickup_origin']='Grip center; original Blender local +Z along handle'
    o['source']='Original local Blender Python geometry'
    return o

def lathe(name,profiles,mat,parent=None,axis='Z',n=64,cap=True):
    vs,fs=[],[]
    for pos,rx,ry in profiles:
        for i in range(n):
            t=2*math.pi*i/n
            a=rx*math.cos(t);b=ry*math.sin(t)
            if axis=='Z':vs.append((a,b,pos))
            elif axis=='Y':vs.append((a,pos,b))
            else:vs.append((pos,a,b))
    for j in range(len(profiles)-1):
        for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    if cap:
        fs.append(tuple(reversed(range(n))));fs.append(tuple((len(profiles)-1)*n+i for i in range(n)))
    return mesh(name,vs,fs,mat,parent)

def box(name,loc,size,mat,parent=None,bevel=.001):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=organize(bpy.context.object);o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat);o.parent=parent;o['license']='CC0-1.0'
    mod=o.modifiers.new('Manufacturing edge radius','BEVEL');mod.width=bevel;mod.segments=4
    for p in o.data.polygons:p.use_smooth=True
    o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');parts.append(o)
    return o

def curve(name,points,radius,mat,parent=None):
    data=bpy.data.curves.new(name+' curve','CURVE');data.dimensions='3D';data.resolution_u=12
    data.bevel_depth=radius;data.bevel_resolution=3
    s=data.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points):
        p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,data);asset.objects.link(o);o.data.materials.append(mat)
    o.parent=parent;o['license']='CC0-1.0';parts.append(o);return o

def torus(name,major,minor,loc,mat,parent,axis='Z'):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=64,minor_segments=10,location=loc)
    o=organize(bpy.context.object);o.name=name;o.data.materials.append(mat);o.parent=parent
    if axis=='Y':o.rotation_euler.x=math.pi/2
    elif axis=='X':o.rotation_euler.y=math.pi/2
    for p in o.data.polygons:p.use_smooth=True
    o['license']='CC0-1.0';parts.append(o);return o

# A shallow, one-piece rolled steel tray; floor and rim are shared vertices.
def outline(hx,hy,r,z,n=12):
    points=[]
    for cx,cy,start in [(hx-r,hy-r,0),(-hx+r,hy-r,90),(-hx+r,-hy+r,180),(hx-r,-hy+r,270)]:
        for i in range(n):
            t=math.radians(start+90*i/n)
            points.append((cx+r*math.cos(t),cy+r*math.sin(t),z))
    return points
vs=[]
tray_rows=[(.201,.133,.020,.019),(.204,.136,.023,.019),(.207,.139,.024,.022),
           (.216,.148,.027,.044),(.220,.152,.029,.047),(.222,.154,.030,.047),
           (.224,.156,.031,.0465)]
n=48
for row in tray_rows:vs.extend(outline(*row))
fs=[tuple(range(n))]
for j in range(len(tray_rows)-1):
    for i in range(n):fs.append((j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n))
tray=mesh('Tray | continuous rolled steel shell',vs,fs,steel,None,1)
# Recalculate for the intended inner-facing open sheet orientation, then add physical thickness.
if tray.data.polygons[0].normal.z<0:
    bm=bmesh.new();bm.from_mesh(tray.data)
    bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(tray.data);bm.free()
solid=tray.modifiers.new('Steel sheet thickness','SOLIDIFY');solid.thickness=.0018;solid.offset=-1
tray['surface_floor_z_m']=.019
for x in [-.168,.168]:
    for y in [-.105,.105]:box('Tray | silicone foot',(x,y,.009),(.022,.017,.018),dark,bevel=.003)

# OTOSCOPE: a continuous ergonomic grip, battery collar, optical body and hollow disposable cone.
oto=root('OtoscopePickup','otoscope')
grip_rows=[(-.071,.011,.011),(-.070,.014,.014),(-.066,.015,.015),(-.057,.016,.0158)]
for j in range(14):
    z=-.054+j*.006
    # Two support rings per groove give molded grip detail without stacked independent beads.
    r=.0160-.0009*math.exp(-((z+.015)/.025)**2)
    grip_rows.extend([(z,r,r*.98),(z+.0014,r-.00055,(r-.00055)*.98),(z+.0025,r,r*.98)])
grip_rows.extend([(.030,.015,.015),(.040,.0145,.0145),(.041,.0145,.0145)])
grip=lathe('Otoscope | connected ribbed grip',grip_rows,dark,oto)
lathe('Otoscope | battery cap',[(-.073,.011,.011),(-.0725,.0145,.0145),(-.0695,.0145,.0145),(-.0685,.014,.014)],steel,oto)
lathe('Otoscope | neck collar',[(.036,.0142,.0142),(.038,.015,.015),(.045,.015,.015),(.047,.0105,.0105),(.065,.0105,.0105)],polish,oto)
head=lathe('Otoscope | rounded optical housing',[(.055,.009,.013),(.058,.019,.020),
    (.064,.024,.024),(.086,.025,.025),(.097,.021,.022),(.101,.014,.015)],steel,oto,n=64)
head['optics']='Symbolic instrument; no clinical functionality'
# Optical axis points across the handle. All cone surfaces are one hollow connected mesh.
spec=lathe('Otoscope | hollow speculum',[
    (-.083,.0040,.0040),(-.082,.0055,.0055),(-.079,.0062,.0062),
    (-.036,.0190,.0190),(-.027,.0195,.0195),(-.025,.0170,.0170),
    (-.028,.0148,.0148),(-.036,.0144,.0144),(-.077,.0037,.0037),
    (-.083,.0026,.0026)],black,oto,axis='Y',n=64,cap=False)
spec.location.z=.079
# Joining the tip and base edges closes the wall while keeping the viewing aperture empty.
bm=bmesh.new();bm.from_mesh(spec.data);bm.verts.ensure_lookup_table()
for i in range(64):bm.faces.new((bm.verts[i],bm.verts[(i+1)%64],bm.verts[9*64+(i+1)%64],bm.verts[9*64+i]))
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(spec.data);bm.free()
mount=lathe('Otoscope | speculum steel mount',[(-.031,.019,.019),(-.029,.020,.020),(-.024,.020,.020),(-.022,.018,.018)],polish,oto,axis='Y')
mount.location.z=.079
rear=lathe('Otoscope | ocular frame',[(.021,.011,.011),(.023,.0155,.0155),(.025,.016,.016),(.028,.014,.014)],dark,oto,axis='Y');rear.location.z=.079
ocular=lathe('Otoscope | ocular lens',[(.0275,.0125,.0125),(.0280,.0130,.0130),(.0290,.0100,.0100)],glass,oto,axis='Y');ocular.location.z=.079
switch=box('Otoscope | thumb switch',(0,-.0158,.026),(.009,.005,.015),mint,oto,.0025)
box('Otoscope | switch travel slot',(0,-.0164,.026),(.011,.002,.020),groove,oto,.003)
oto.location=(-.024,.077,.040)
oto.rotation_euler.y=math.pi/2-.060

# DIGITAL THERMOMETER: one gently waisted body and probe silhouette, blank inactive LCD.
thermo=root('ThermometerPickup','thermometer')
thermo['pickup_origin']='Grip center; original Blender local +X along body'
profiles=[(-.088,.008,.0045),(-.086,.014,.0065),(-.080,.017,.008),(-.063,.018,.008),
    (-.027,.018,.008),(-.013,.017,.0077),(.006,.015,.007),(.025,.012,.0055),
    (.035,.0065,.004),(.045,.004,.0033),(.067,.0038,.0031),(.083,.0035,.0029),(.087,.0014,.0015)]
tv,tf=[],[];tn=48
for x,ry,rz in profiles:
    for i in range(tn):
        t=i*2*math.pi/tn
        yy=ry*math.copysign(abs(math.sin(t))**.56,math.sin(t))
        zz=rz*math.copysign(abs(math.cos(t))**.56,math.cos(t))
        tv.append((x,yy,zz))
for j in range(len(profiles)-1):
    for i in range(tn):tf.append((j*tn+i,(j+1)*tn+i,(j+1)*tn+(i+1)%tn,j*tn+(i+1)%tn))
tf.append(tuple(reversed(range(tn))));tf.append(tuple((len(profiles)-1)*tn+i for i in range(tn)))
body=mesh('Thermometer | continuous waist and probe',tv,tf,ivory,thermo,1)
body.data.materials.append(polish)
for polygon in body.data.polygons:
    if polygon.center.x>.066:polygon.material_index=1
box('Thermometer | LCD molded bezel',(-.046,0,.0081),(.051,.025,.0025),dark,thermo,.0034)
box('Thermometer | inactive blank display',(-.046,0,.00965),(.042,.0175,.0011),lcd,thermo,.0023)
box('Thermometer | clear screen cover',(-.046,0,.0104),(.042,.0175,.0005),glass,thermo,.0023)
button=box('Thermometer | tactile on button',(-.006,0,.0082),(.012,.012,.003),mint,thermo,.0050)
# A graphic power mark conveys affordance without a numerical reading.
curve('Thermometer | power ring',[(-.0082,-.002,.0100),(-.0092,0,.0100),(-.0082,.002,.0100),
    (-.0055,.0027,.0100),(-.0033,.001,.0100)],.00035,ivory,thermo)
curve('Thermometer | power stroke',[(-.0054,-.0009,.0100),(-.0054,.0033,.0100)],.00035,ivory,thermo)
for side in [-1,1]:
    curve('Thermometer | shell join', [(-.079,side*.0171,0),(-.047,side*.0183,0),
        (-.014,side*.0173,0),(.012,side*.0143,0),(.030,side*.0094,0)],.00024,mint,thermo)
thermo.location=(-.029,-.025,.0278)
thermo.rotation_euler.z=math.radians(-6)

# PENLIGHT: ivory aluminum barrel, spring clip, machined collar, reflector and unlit lens.
pen=root('PenlightPickup','light')
barrel=lathe('Penlight | continuous ivory barrel',[
    (-.076,.0060,.0060),(-.074,.0080,.0080),(-.069,.0090,.0090),
    (.041,.0090,.0090),(.046,.0092,.0092),(.053,.0092,.0092)],ivory,pen)
lathe('Penlight | rear push button',[(-.084,.0045,.0045),(-.083,.0065,.0065),(-.076,.0065,.0065),(-.074,.0055,.0055)],mint,pen)
lathe('Penlight | rear steel cap',[(-.075,.0080,.0080),(-.073,.0092,.0092),(-.069,.0092,.0092),(-.068,.0090,.0090)],steel,pen)
collar=lathe('Penlight | machined optical collar',[(.046,.0093,.0093),(.048,.0112,.0112),
    (.060,.0112,.0112),(.064,.0120,.0120),(.069,.0120,.0120),(.070,.0108,.0108)],steel,pen)
for z in [.051,.054,.057]:torus('Penlight | collar machining groove',.0112,.00035,(0,0,z),dark,pen)
# Reflector dish is a single annular surface, with the LED behind the clear front cover.
reflector=lathe('Penlight | inset reflector',[(.070,.0103,.0103),(.069,.0098,.0098),
    (.063,.0045,.0045),(.063,.0018,.0018)],polish,pen,cap=False)
lathe('Penlight | unlit LED',[(.0632,.0014,.0014),(.064,.0017,.0017),(.0646,.0011,.0011)],led,pen)
lathe('Penlight | clear protective lens',[(.0701,.0102,.0102),(.0707,.0102,.0102)],glass,pen)
torus('Penlight | polished lens rim',.0109,.00075,(0,0,.0705),polish,pen)
# Thin rectangular strip, bent around the barrel, reads as a manufactured spring clip.
cv,cf=[],[]
clip_stations=[(.0085,.040),(.012,.043),(.0135,.037),(.0135,-.038),(.0145,-.044),(.012,-.047)]
for yy,z in clip_stations:
    for x,y in [(-.0023,yy-.00055),(.0023,yy-.00055),(.0023,yy+.00055),(-.0023,yy+.00055)]:cv.append((x,y,z))
for j in range(len(clip_stations)-1):
    for i in range(4):cf.append((j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i))
cf.append((3,2,1,0));cf.append(tuple((len(clip_stations)-1)*4+i for i in range(4)))
clip=mesh('Penlight | bent spring pocket clip',cv,cf,steel,pen)
clip.rotation_euler.z=math.pi/2
bevel=clip.modifiers.new('Clip rounded stamped edges','BEVEL');bevel.width=.0006;bevel.segments=3
clip.modifiers.new('Clip face normals','WEIGHTED_NORMAL')
pen.location=(.018,-.098,.0315)
pen.rotation_euler.y=math.pi/2
pen.rotation_euler.z=math.radians(3)

# Correct contact height from evaluated tool surfaces, rather than guessing or leaving pieces floating.
bpy.context.view_layer.update()
depsgraph=bpy.context.evaluated_depsgraph_get()
contacts=[]
for tool in [oto,thermo,pen]:
    minimum=10
    for o in tool.children:
        if o.type not in {'MESH','CURVE'}:continue
        evaluated=o.evaluated_get(depsgraph);geometry=evaluated.to_mesh()
        for vertex in geometry.vertices:minimum=min(minimum,(evaluated.matrix_world@vertex.co).z)
        evaluated.to_mesh_clear()
    adjustment=.0193-minimum
    tool.location.z+=adjustment
    contacts.append({'tool_id':tool['tool_id'],'initial_min_z':minimum,'vertical_contact_adjustment':adjustment,'final_min_z':.0193})
    bpy.context.view_layer.update()
scene['tool_contact_audit']=json.dumps(contacts)
scene['original_asset_license']='CC0-1.0'

# Export evaluated parts as standalone pickups with the grip center at local origin.
def exported_copy(obj,col,parent,matrix):
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
    o=bpy.data.objects.new(obj.name,data);col.objects.link(o);o.parent=parent;o.matrix_world=matrix
    o['license']='CC0-1.0';return o

exports=[]
for tool in [oto,thermo,pen]:
    col=bpy.data.collections.new('TEMP_EXPORT_'+tool['tool_id']);scene.collection.children.link(col)
    export_root=bpy.data.objects.new(tool.name,None);col.objects.link(export_root)
    for k in tool.keys():export_root[k]=tool[k]
    inverse=tool.matrix_world.inverted()
    copies=[exported_copy(o,col,export_root,inverse@o.matrix_world) for o in tool.children if o.type in {'MESH','CURVE'}]
    bpy.ops.object.select_all(action='DESELECT')
    for o in col.objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=PUBLIC+'/'+tool['tool_id']+'.glb',export_format='GLB',use_selection=True,
        export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    exports.append({'tool_id':tool['tool_id'],'parts':len(copies),'path':PUBLIC+'/'+tool['tool_id']+'.glb'})
    for o in list(col.objects):bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.collections.remove(col)
bpy.ops.object.select_all(action='DESELECT')
for o in asset.objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=PUBLIC+'/instruments-tray.glb',export_format='GLB',use_selection=True,
    export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)

# Soft studio lighting for a clear, verifiable high-resolution small object presentation.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0))
ground=organize(bpy.context.object,studio);ground.name='Studio floor';ground.data.materials.append(floor_mat)
bpy.ops.object.camera_add(location=(.58,-.79,.96))
camera=organize(bpy.context.object,studio);camera.name='Instrument hero camera'
camera.rotation_euler=(Vector((0,0,.029))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=.62;scene.camera=camera
def area(name,location,energy,size,color):
    bpy.ops.object.light_add(type='AREA',location=location)
    o=organize(bpy.context.object,studio);o.name=name;o.data.energy=energy;o.data.size=size
    o.data.color=color;o.rotation_euler=(Vector((0,0,.02))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key | large softbox',(-.6,-.5,1.2),24,.8,(1,.90,.79))
area('Fill | clinic skylight',(.7,-.1,.9),18,.65,(.80,.92,1))
area('Rim | metal edge',(.0,.8,.8),22,.75,(1,1,.95))
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.65,.76,.68,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.resolution_x=1100;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.25
scene.render.filepath=OUT+'/render.png'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/instruments.blend')
print(json.dumps({'phase':'instruments-model-export-ready','exports':exports,'contact_audit':contacts,
    'path':OUT+'/instruments.blend','thermometer_display':'inactive blank LCD; no fabricated readings'}))
