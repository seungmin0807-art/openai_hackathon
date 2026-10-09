"""Original local Blender geometry. MIT script; generated geometry CC0-1.0.

Units are meters. Z-up in Blender; the glTF exporter converts to Y-up.
Run through mcp_client.py --script build_clinic_station.py or Blender --python.
"""
import bpy
import math
import json
from mathutils import Vector

OUT = 'C:/dev/openai_hackathon/artifacts/blender-mcp'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablock in list(bpy.data.materials):
    bpy.data.materials.remove(datablock)

def material(name, hexcolor, roughness=.4, metal=0):
    rgb = [int(hexcolor[i:i+2], 16) / 255 for i in (0, 2, 4)]
    linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*linear, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    return mat

mint = material('Cabinet | jade enamel', '78AD9A', .32)
cream = material('Cabinet | warm porcelain', 'F2EEE0', .35)
dark = material('Rubber | forest green', '244D43', .47)
metal = material('Metal | brushed stainless steel', 'CBD5D4', .24, .88)
polished = material('Metal | polished chrome', 'DFE6E5', .16, .96)
white = material('Cotton | ivory', 'F8F5E9', .8)
wallmat = material('Wall | warm off-white', 'ECEDE2', .82)
accent = material('Wall | sage accent', 'B8CEC0', .72)
floormat = material('Floor | warm terrazzo base', 'D6D8CD', .65)
oak = material('Shelf | warm oak', 'B99D76', .5)
labelmat = material('Label | deep sage', '4C6F61', .5)
amber = material('Soap | peach bottle', 'E3B687', .4)
pink = material('Supply | muted rose', 'D9AA9D', .5)

# Two collections keep the exportable module separate from presentation geometry.
asset_collection = bpy.data.collections.new('CLINIC_STATION_ASSET')
bpy.context.scene.collection.children.link(asset_collection)
studio_collection = bpy.data.collections.new('STUDIO_ONLY')
bpy.context.scene.collection.children.link(studio_collection)
current_collection = asset_collection

def organize(obj):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    current_collection.objects.link(obj)
    return obj

def finish(obj, mat, bevel=0, smooth=True):
    organize(obj)
    if mat:
        obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Manufactured edge radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 4
    if obj.type == 'MESH':
        for face in obj.data.polygons:
            face.use_smooth = smooth
        if bevel:
            mod = obj.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
            mod.keep_sharp = True
            mod.weight = 50
    return obj

def box(name, location, size, mat, bevel=.009):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, bevel)

def cylinder(name, location, radius, depth, mat, bevel=.003, vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat, bevel)

def tube(name, points, radius, mat, resolution=12):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    curve.use_fill_caps = True
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for p, co in zip(spline.bezier_points, points):
        p.co = co
        p.handle_left_type = 'AUTO'
        p.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    current_collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

def rod(name, start, end, radius, mat):
    v = Vector(end)-Vector(start)
    obj = cylinder(name, (Vector(start)+Vector(end))/2, radius, v.length, mat, .0015, 32)
    obj.rotation_euler = v.to_track_quat('Z', 'Y').to_euler()
    return obj

def rounded_loop(width, depth, radius, z, segments=10):
    points = []
    for cx, cy, a0 in [(width/2-radius, depth/2-radius, 0),
                       (-width/2+radius, depth/2-radius, 90),
                       (-width/2+radius, -depth/2+radius, 180),
                       (width/2-radius, -depth/2+radius, 270)]:
        for i in range(segments+1):
            a = math.radians(a0+90*i/segments)
            points.append((cx+radius*math.cos(a), cy+radius*math.sin(a), z))
    return points

def basin(name, location, profiles, mat):
    # One continuous quad surface runs from the underside through the walls to the lip.
    verts = []
    for w, d, r, z in profiles:
        verts.extend(rounded_loop(w, d, r, z))
    n = len(verts)//len(profiles)
    faces = [tuple(range(n))]
    for ring in range(len(profiles)-1):
        for i in range(n):
            a=ring*n+i; b=ring*n+(i+1)%n
            faces.append((a,a+n,b+n,b))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    current_collection.objects.link(obj)
    obj.data.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = len(face.vertices)==4
    solid = obj.modifiers.new('Sheet metal thickness', 'SOLIDIFY')
    solid.thickness = .002
    solid.offset = -1
    return obj

def text(name, content, location, size, mat, facing='FRONT'):
    font = bpy.data.curves.new(name, 'FONT')
    font.body = content
    font.size = size
    font.align_x = 'CENTER'
    font.align_y = 'CENTER'
    font.extrude = .00015
    font.bevel_depth = .00008
    obj = bpy.data.objects.new(name, font)
    obj.location = location
    obj.rotation_euler = (math.pi/2,0,0) if facing=='FRONT' else (0,0,0)
    current_collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

# Furniture: 2.6 m cabinet, recessed plinth, open seams, metal pulls.
box('Cabinet | recessed plinth', (0,.015,.075),(2.49,.55,.15),dark,.012)
box('Cabinet | bottom shelf',(0,.015,.144),(2.6,.62,.024),cream,.009)
box('Cabinet | back panel',(0,.312,.528),(2.6,.026,.744),cream,.006)
for x in [-.437,.437]:
    box('Cabinet | internal partition',(x,.015,.528),(.018,.596,.744),cream,.005)
box('Cabinet | top support right',(.60,.015,.906),(1.42,.59,.028),cream,.006)
box('Cabinet | sink front support',(-.85,-.255,.906),(.81,.08,.028),cream,.006)
box('Cabinet | sink rear support',(-.85,.275,.906),(.81,.064,.028),cream,.006)
box('Cabinet | upper shadow reveal',(0,-.302,.891),(2.54,.01,.028),dark,.002)
for x in [-1.30,1.30]:
    box('Cabinet | side end panel',(x,.015,.528),(.025,.63,.814),cream,.008)
for x in [-.85,.86]:
    box('Cabinet | mint door',(x,-.316,.523),(.80,.038,.71),mint,.012)
    box('Cabinet | door handle',(x,-.349,.779),(.235,.033,.017),metal,.006)
for i,z in enumerate([.755,.522,.289]):
    box('Cabinet | drawer %02d'%(i+1),(0,-.316,z),(.86,.038,.216),mint,.01)
    box('Cabinet | drawer pull %02d'%(i+1),(0,-.350,z+.046),(.265,.032,.018),metal,.006)

counter = box('Countertop | solid surface',(0,.0,.944),(2.71,.69,.048),cream,0)
cut = box('TEMP_SINK_CUTTER',(-.86,.055,.92),(.514,.357,.45),None,.045)
bpy.context.view_layer.objects.active = cut
bpy.ops.object.modifier_apply(modifier='Manufactured edge radius')
bpy.context.view_layer.objects.active = counter
mod = counter.modifiers.new('Real recessed sink cutout','BOOLEAN')
mod.operation='DIFFERENCE';mod.object=cut
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(cut,do_unlink=True)
mod=counter.modifiers.new('Countertop edge radius','BEVEL');mod.width=.008;mod.segments=4
counter.modifiers.new('Countertop normals','WEIGHTED_NORMAL')
basin('Sink | continuous bowl',(-.86,.055,.967),[
    (.42,.26,.055,-.133),(.46,.29,.062,-.129),(.50,.34,.07,-.034),
    (.514,.358,.07,-.008),(.54,.385,.072,.001),(.564,.408,.074,.001)],metal)
cylinder('Sink | drain',(-.86,.055,.838),.031,.004,polished,.002)
for i in range(7):
    a=2*math.pi*i/7
    cylinder('Sink | drain perforation',(-.86+.016*math.cos(a),.055+.016*math.sin(a),.841),.0025,.0008,dark,0,16)
tube('Faucet | continuous swan neck',[(-.86,.266,.980),(-.86,.266,1.18),(-.86,.25,1.315),
    (-.86,.132,1.335),(-.86,.062,1.26)],.018,polished)
cylinder('Faucet | base',(-.86,.266,.973),.035,.013,polished)
rod('Faucet | mixer lever',(-.825,.266,1.035),(-.745,.266,1.04),.008,metal)
cylinder('Soap | pump bottle',(-1.195,.20,1.041),.042,.14,amber,.008)
cylinder('Soap | collar',(-1.195,.20,1.120),.021,.019,cream)
rod('Soap | pump spout',(-1.195,.20,1.143),(-1.145,.20,1.143),.009,cream)

# Tray rests directly on the solid surface. A closed sheet shell rather than stacked boxes.
tray_x=.58;tray_y=-.018;tray_z=.978
tray=basin('Tray | connected rolled steel shell',(tray_x,tray_y,tray_z),[
    (.73,.33,.034,.001),(.75,.35,.045,.002),(.78,.38,.05,.011),
    (.835,.435,.057,.039),(.851,.451,.058,.041),(.864,.464,.061,.039)],metal)
tray['contact_surface_z_m']=.977
tray['role']='tool-selection-tray'

# Stethoscope: lying horizontally. Tube curves connect the chestpiece to the Y junction.
z=tray_z+.011
tube('Stethoscope | continuous flexible tube',[(.435,-.070,z),(.447,.034,z),(.536,.113,z),
    (.704,.124,z),(.843,.062,z),(.906,-.049,z),(.854,-.117,z)],.0062,dark,18)
tube('Stethoscope | left Y branch',[(.435,-.070,z),(.389,-.051,z),(.346,.011,z)],.0062,dark)
tube('Stethoscope | right Y branch',[(.435,-.070,z),(.386,-.099,z),(.348,-.170,z)],.0062,dark)
tube('Stethoscope | upper steel binaural',[(.346,.011,z),(.304,.061,z),(.245,.053,z),(.228,.014,z)],.0039,polished)
tube('Stethoscope | lower steel binaural',[(.348,-.170,z),(.304,-.204,z),(.249,-.200,z),(.228,-.162,z)],.0039,polished)
rod('Stethoscope | upper soft ear tip',(.228,.014,z),(.230,-.010,z),.0075,dark)
rod('Stethoscope | lower soft ear tip',(.228,-.162,z),(.230,-.140,z),.0075,dark)
tube('Stethoscope | binaural spring',[(.346,.011,z),(.319,-.027,z),(.319,-.120,z),(.348,-.170,z)],.0023,polished)
cx=.854;cy=-.117
cylinder('Stethoscope | chestpiece lower flange',(cx,cy,tray_z+.006),.035,.010,polished,.0025,64)
cylinder('Stethoscope | diaphragm rim',(cx,cy,tray_z+.013),.032,.006,metal,.002,64)
cylinder('Stethoscope | chestpiece top',(cx,cy,tray_z+.018),.0265,.006,dark,.002,64)
rod('Stethoscope | hose connector',(cx,cy,tray_z+.014),(cx+.034,cy+.004,tray_z+.014),.007,polished)
for obj in asset_collection.objects:
    if obj.name.startswith('Stethoscope'):
        obj['selectable_tool']='stethoscope'
        obj['display_pose']='lying-flat'

# Context: backsplash and attached shelf. Three supply types, no external brands.
box('Backsplash | washable sage panel',(0,.354,1.28),(2.71,.028,.59),accent,.008)
box('Backsplash | upper oak edge',(0,.354,1.581),(2.71,.042,.020),oak,.004)
box('Shelf | oak plank',(.13,.235,1.859),(1.87,.25,.035),oak,.009)
for x in [-.62,.86]:
    box('Shelf | wall bracket',(x,.347,1.80),(.034,.025,.16),metal,.005)
    box('Shelf | support arm',(x,.242,1.79),(.034,.21,.026),metal,.005)
for x,w,h,col,word in [(-.49,.32,.24,cream,'GAUZE'),(-.105,.31,.19,pink,'GLOVES')]:
    box('Supplies | '+word+' box',(x,.23,1.88+h/2),(w,.185,h),col,.009)
    box('Supplies | label '+word,(x,.133,1.88+h*.56),(w*.75,.002,.045),white,.001)
    text('Supplies | printed '+word,word,(x,.131,1.88+h*.56),.023,labelmat)
for i in range(3):
    box('Supplies | folded towel '+str(i),(.50,.22,1.902+i*.040),(.45,.185,.035),white,.013)
    box('Supplies | towel edge seam '+str(i),(.50,.122,1.901+i*.040),(.39,.005,.008),cream,.002)
cylinder('Supplies | cotton jar',(.89,.225,1.96),.066,.17,cream,.009)
cylinder('Supplies | jar lid',(.89,.225,2.05),.071,.022,oak,.006)

# Exam light mechanically attached to the wall, with hinged rigid links.
box('Exam light | wall mount',(1.20,.365,1.70),(.145,.056,.235),cream,.018)
rod('Exam light | first articulated arm',(1.20,.306,1.70),(1.35,.022,1.75),.020,cream)
rod('Exam light | second articulated arm',(1.35,.022,1.75),(1.18,-.19,1.56),.017,cream)
for pos in [(1.20,.306,1.70),(1.35,.022,1.75),(1.18,-.19,1.56)]:
    hinge=cylinder('Exam light | hinge',pos,.031,.034,metal,.004)
    hinge.rotation_euler=(math.pi/2,0,0)
lamp=cylinder('Exam light | round head',(1.165,-.206,1.515),.103,.075,cream,.012,64)
lamp.rotation_euler=(.20,.12,0)
diffuser=cylinder('Exam light | recessed diffuser',(1.160,-.197,1.476),.082,.007,white,.003,64)
diffuser.rotation_euler=lamp.rotation_euler
lampmat=material('Exam light | soft lit glass','FFF2D9',.3)
bs=lampmat.node_tree.nodes.get('Principled BSDF')
bs.inputs['Emission Color'].default_value=(1,.86,.64,1)
bs.inputs['Emission Strength'].default_value=.7
diffuser.data.materials.clear();diffuser.data.materials.append(lampmat)

# Pedal waste bin on the floor, with a recessed base and visible lid seam.
cylinder('Waste bin | rubber foot',(1.66,.12,.025),.159,.05,dark,.01)
cylinder('Waste bin | body',(1.66,.12,.259),.161,.43,cream,.022,64)
cylinder('Waste bin | upper seam',(1.66,.12,.478),.160,.012,dark,.003)
cylinder('Waste bin | lid',(1.66,.12,.499),.171,.032,mint,.013,64)
box('Waste bin | pedal',(1.66,-.060,.055),(.115,.075,.021),metal,.006)
box('Waste bin | label',(1.66,-.042,.286),(.075,.004,.065),accent,.005)
text('Waste bin | small label','WASTE',(1.66,-.045,.286),.013,labelmat)

# Light switches finish the functional wall context.
box('Wall | outlet plate',(.095,.332,1.31),(.091,.022,.075),cream,.007)
for x in [.074,.114]:
    box('Wall | outlet socket',(x,.316,1.31),(.018,.009,.032),dark,.003)

# Asset metadata and separate Studio-only presentation set.
for obj in asset_collection.objects:
    obj['asset_author']='Original local Blender Python modelling'
    obj['asset_license']='CC0-1.0'
current_collection=studio_collection
box('Studio | floor',(0,-.15,-.035),(4.6,3.2,.06),floormat,.01)
box('Studio | wall',(0,.45,1.27),(4.6,.12,2.61),wallmat,.014)
box('Studio | skirting',(0,.376,.052),(4.6,.035,.09),cream,.008)
# Sparse floor joints provide scale without a noisy procedural pattern.
for x in [-1.5,-.5,.5,1.5]:
    box('Studio | tile joint',(x,-.15,-.003),(.002,3.1,.001),cream,0)
for y in [-1.1,-.1]:
    box('Studio | tile joint',(0,y,-.003),(4.5,.002,.001),cream,0)

def area(name,location,target,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);current_collection.objects.link(obj);obj.location=location
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
area('Light | broad warm key',(-2.3,-2.1,4.4),(0,0,1),580,3.2,(1.0,.91,.78))
area('Light | cool fill',(2.4,-.7,3.3),(.4,0,1),360,2.5,(.83,.92,1.0))
area('Light | overhead strip',(-.1,.1,3.2),(.3,-.15,.98),150,1.7,(1.0,.98,.88))
data=bpy.data.cameras.new('Camera | station hero')
cam=bpy.data.objects.new('Camera | station hero',data);current_collection.objects.link(cam)
cam.location=(3.35,-4.75,3.15)
target=Vector((.08,.025,1.05));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO';data.ortho_scale=3.75;data.lens=50
scene=bpy.context.scene;scene.camera=cam
scene.unit_settings.system='METRIC'
scene.world.color=(.24,.24,.24)
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.72,.79,.76,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.cycles.max_bounces=7
scene.render.resolution_x=1100;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.render.filepath=OUT+'/render-first.png'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/clinic-station.blend')
print(json.dumps({'phase':'scene-created','objects':len(asset_collection.objects),'blender':bpy.app.version_string,'asset':'clinic-station'}))
bpy.ops.render.render(write_still=True)
print(json.dumps({'phase':'render-first-complete','path':scene.render.filepath}))
