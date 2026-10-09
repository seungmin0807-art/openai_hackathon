"""Six original room furnishings at exact requested game units.
MIT code; original geometry/materials/artwork CC0-1.0. No external assets or APIs.
Local Blender MCP. Blender Z-up/-Y-front -> glTF Y-up/+Z-front.
"""
import bpy
import bmesh
import math
import json
from mathutils import Vector

OUT='C:/dev/openai_hackathon/artifacts/blender-mcp/room-furniture'
PUBLIC='C:/dev/openai_hackathon/public/assets/clinic/blender-candidates/room-furniture'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name.startswith('ROOM_FURNITURE') or c.name.startswith('STUDIO_ONLY'):bpy.data.collections.remove(c)
for m in list(bpy.data.materials):bpy.data.materials.remove(m)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
asset=bpy.data.collections.new('ROOM_FURNITURE');scene.collection.children.link(asset)
studio=bpy.data.collections.new('STUDIO_ONLY');scene.collection.children.link(studio)
roots=[];parts=[]

def material(name,color,rough=.5,metal=0):
    rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)]
    rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=m.diffuse_color
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
cream=material('Warm cream | powder coat','EEEADD',.54)
mint=material('Mint | pediatric clinic enamel','7FAE9D',.48)
upholstery=material('Upholstery | soft eucalyptus','A3C4B2',.77)
dark=material('Dark green | rubber and soft trims','315A4C',.73)
steel=material('Steel | satin brushed','CDD7D2',.29,.9)
chrome=material('Chrome | clean polished edges','E3E8E2',.18,.96)
display=material('Display | neutral inactive slate','657D75',.32)
accent=material('Control | subtle sage','A9BDB0',.55)
floor_mat=material('Studio | quiet warm grey','D2DDD3',.85)

def organize(o,col=asset):
    for c in list(o.users_collection):c.objects.unlink(o)
    col.objects.link(o);return o
def root(name,meta):
    o=bpy.data.objects.new(name,None);asset.objects.link(o);roots.append(o)
    o['asset_id']=name;o['license']='CC0-1.0';o['units']='game units'
    o['front_axis']='glTF +Z';o['root_origin']='XZ center; bottom/support base Y=0'
    o['geometry_source']='Original local Blender Python'
    o['contact_metadata']=json.dumps(meta)
    if 'seat_top' in meta:o['seat_top_m']=meta['seat_top'];o['support_top_m']=meta['seat_top']
    if 'countertop_top' in meta:o['top_m']=meta['countertop_top'];o['support_top_m']=meta['countertop_top']
    elif 'top' in meta:o['top_m']=meta['top']
    if 'bottom_support_top' in meta:o['support_top_m']=meta['bottom_support_top']
    if 'stand_support_top' in meta:o['support_top_m']=meta['stand_support_top']
    return o
def box(name,loc,size,mat,parent,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=organize(bpy.context.object);o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat);o.parent=parent
    b=o.modifiers.new('Manufactured rounded edge','BEVEL');b.width=bevel;b.segments=4
    for p in o.data.polygons:p.use_smooth=True
    o.modifiers.new('Planar surface normals','WEIGHTED_NORMAL');o['license']='CC0-1.0';parts.append(o)
    return o
def mesh(name,vs,fs,mat,parent,sub=0):
    data=bpy.data.meshes.new(name+' mesh');data.from_pydata(vs,[],fs);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    o=bpy.data.objects.new(name,data);asset.objects.link(o);o.data.materials.append(mat);o.parent=parent
    for p in o.data.polygons:p.use_smooth=True
    if sub:
        m=o.modifiers.new('Smooth continuous surface','SUBSURF');m.levels=sub;m.render_levels=sub
    o['license']='CC0-1.0';parts.append(o);return o
def curve(name,points,radius,mat,parent):
    data=bpy.data.curves.new(name+' curve','CURVE');data.dimensions='3D';data.resolution_u=16
    data.bevel_depth=radius;data.bevel_resolution=4;data.use_fill_caps=True
    s=data.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,data);asset.objects.link(o);o.data.materials.append(mat);o.parent=parent
    o['license']='CC0-1.0';parts.append(o);return o
def lathe(name,profiles,mat,parent,axis='Z',location=(0,0,0),n=48):
    vs,fs=[],[]
    for pos,r in profiles:
        for i in range(n):
            t=i*2*math.pi/n
            if axis=='Z':vs.append((r*math.cos(t),r*math.sin(t),pos))
            elif axis=='X':vs.append((pos,r*math.cos(t),r*math.sin(t)))
            else:vs.append((r*math.cos(t),pos,r*math.sin(t)))
    for j in range(len(profiles)-1):
        for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    fs.append(tuple(reversed(range(n))));fs.append(tuple((len(profiles)-1)*n+i for i in range(n)))
    o=mesh(name,vs,fs,mat,parent);o.location=location;return o
def pull(name,x,y,z,parent,length=.19):
    o=curve(name,[(x,y+.030,z-length/2),(x,y,z-length/2+.025),
        (x,y,z+length/2-.025),(x,y+.030,z+length/2)],.014,steel,parent)
    p=o.data.splines[0].bezier_points
    for point in p:point.handle_left_type='FREE';point.handle_right_type='FREE'
    p[0].handle_left=p[0].co;p[0].handle_right=(x,y+.030,z-length/2+.015)
    p[1].handle_left=(x,y+.015,z-length/2+.025);p[1].handle_right=(x,y,z-length/2+.055)
    p[2].handle_left=(x,y,z+length/2-.055);p[2].handle_right=(x,y+.015,z+length/2-.025)
    p[3].handle_left=(x,y+.030,z+length/2-.015);p[3].handle_right=p[3].co
    return o
def outline(hx,hy,r,z,center=(0,0),n=10):
    v=[]
    for cx,cy,start in [(hx-r,hy-r,0),(-hx+r,hy-r,90),(-hx+r,-hy+r,180),(hx-r,-hy+r,270)]:
        for i in range(n):
            t=math.radians(start+i*90/n);v.append((center[0]+cx+r*math.cos(t),center[1]+cy+r*math.sin(t),z))
    return v
def annular_top(name,hx,hy,corner,hole_hx,hole_hy,hole_corner,hole_center,z,thickness,parent):
    vs=outline(hx,hy,corner,z)+outline(hole_hx,hole_hy,hole_corner,z,hole_center)
    n=40;fs=[]
    for i in range(n):fs.append((i,(i+1)%n,n+(i+1)%n,n+i))
    o=mesh(name,vs,fs,cream,parent)
    if o.data.polygons[0].normal.z<0:
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    s=o.modifiers.new('Solid counter thickness','SOLIDIFY');s.thickness=thickness;s.offset=-1
    b=o.modifiers.new('Tiny manufacturing edge','BEVEL');b.width=.003;b.segments=3
    o.modifiers.new('Counter surface normals','WEIGHTED_NORMAL');return o

# 1. Patient chair: exact seat/back/arm/foot contact levels, sturdy fixed frame.
chair=root('patient-chair',{'seat_width':1.65,'seat_depth':1.7,'seat_top':.82,
    'back_top':2.48,'armrest_top':1.3,'footrest_top':.22,'floor':0})
box('Chair | seat upholstered continuous cushion',(0,0,.72),(1.65,1.7,.20),upholstery,chair,.080)
box('Chair | cream seat support',(0,.015,.595),(1.57,1.62,.10),cream,chair,.045)
box('Chair | mint back cushion',(0,.705,1.64),(1.65,.23,1.68),upholstery,chair,.095)
box('Chair | cream back shell',(0,.82,1.615),(1.60,.12,1.63),cream,chair,.050)
for side in [-1,1]:
    for y in [-.64,.65]:
        x=side*.68
        box('Chair | powder coated leg',(x,y,.315),(.075,.075,.55),mint,chair,.012)
        box('Chair | non-slip foot',(x,y,.035),(.14,.14,.07),dark,chair,.020)
    box('Chair | arm steel upright',(side*.96,.42,.86),(.055,.055,.70),steel,chair,.015)
    box('Chair | arm support',(side*.96,-.27,1.17),(.070,1.40,.070),cream,chair,.015)
    box('Chair | padded armrest',(side*.965,-.20,1.245),(.24,1.45,.11),upholstery,chair,.045)
    box('Chair | back support rail',(side*.63,.86,.87),(.055,.050,.60),steel,chair,.012)
    box('Chair | footrest cantilever',(side*.40,-.82,.175),(.06,.77,.06),steel,chair,.012)
box('Chair | footrest contact pad',(0,-1.12,.17),(.98,.56,.10),mint,chair,.037)

# 2. Closed storage cabinet, with contained pulls and exact exterior bounds.
cab=root('storage-cabinet',{'width':1.4,'depth':.65,'top':1.4,'floor':0,'doors':'closed'})
box('Cabinet | cream carcass',(0,.030,.7475),(1.4,.59,1.305),cream,cab,.028)
box('Cabinet | recessed plinth',(0,.030,.05),(1.28,.54,.10),dark,cab,.018)
for side in [-1,1]:
    box('Cabinet | closed mint door',(side*.346,-.284,.748),(.667,.032,1.20),mint,cab,.017)
    pull('Cabinet | satin pull',side*.082,-.311,.86,cab,.20)

# 3. Tabletop monitor: precise screen envelope, fully supported neutral display.
monitor=root('monitor',{'screen_width':1.05,'screen_height':.73,'screen_body_depth':.15,
    'overall_height':.9,'stand_support_top':0,'screen':'neutral inactive; no numeric readings'})
box('Monitor | satin desk stand',(0,0,.020),(.60,.45,.040),steel,monitor,.018)
box('Monitor | stand neck',(0,.10,.140),(.12,.11,.22),cream,monitor,.025)
box('Monitor | rounded bezel',(0,0,.535),(1.05,.15,.73),cream,monitor,.035)
box('Monitor | inactive neutral display',(0,-.077,.542),(.946,.008,.626),display,monitor,.022)
box('Monitor | small inactive control',(0.38,-.079,.216),(.033,.008,.012),accent,monitor,.005)

# 4. Diagnostic wall holder, with a flat .079 support shelf and reachable straps.
holder=root('diagnostic-holder',{'width':.56,'height':1.02,'depth':.69,
    'bottom_support_top':.079,'floor':0,'front_axis':'+Z',
    'hooks':{'otoscope':[-.14,.46,.015],'light':[.14,.46,.015]}})
box('Holder | cream wall plate',(0,.3175,.51),(.56,.055,1.02),cream,holder,.023)
box('Holder | flat support shelf',(0,0,.0395),(.56,.69,.079),mint,holder,.008)
for side in [-1,1]:
    x=side*.14
    box('Holder | steel mounting rail',(x,.259,.45),(.036,.035,.64),steel,holder,.008)
    box('Holder | cantilever strap mount',(x,.130,.46),(.035,.25,.042),steel,holder,.010)
    curve('Holder | soft diagnostic strap',[(x-.081,.19,.46),(x-.083,.065,.46),
        (x-.060,-.002,.46),(x+.060,-.002,.46),(x+.083,.065,.46),(x+.081,.19,.46)],.016,dark,holder)
    box('Holder | shallow cradle',(x,.052,.13),(.19,.24,.050),cream,holder,.015)

# 5. Large low instrument workbench. A flush steel insert shares the .975 contact plane.
bench=root('instrument-workbench',{'width':2.9,'depth':3.7,'height':.975,
    'countertop_top':.975,'floor':0,'contact_plane_extent':[-1.38,1.38,-1.77,1.77],
    'tray':'flush steel insert; no raised rim over instrument contact positions'})
box('Workbench | cream drawer carcass',(0,.045,.563),(2.66,3.36,.60),cream,bench,.045)
for z in [.437,.722]:
    box('Workbench | mint drawer front',(0,-1.682,z),(2.51,.060,.253),mint,bench,.025)
    curve('Workbench | drawer pull',[(-.35,-1.725,z),(-.30,-1.763,z),(.30,-1.763,z),(.35,-1.725,z)],.020,steel,bench)
for x in [-1.20,1.20]:
    for y in [-1.52,1.52]:
        box('Workbench | caster fork',(x,y,.220),(.14,.13,.13),steel,bench,.016)
        lathe('Workbench | rubber caster',[(-.048,.085),(-.038,.11),(.038,.11),(.048,.085)],dark,bench,'X',(x,y,.11),64)
        lathe('Workbench | wheel steel hub',[(-.051,.037),(.051,.037)],steel,bench,'X',(x,y,.11),48)
        box('Workbench | concealed support',(x,y,.38),(.10,.10,.33),cream,bench,.018)
annular_top('Workbench | flat cream countertop',1.45,1.85,.065,.60,1.60,.04,(-.72,0),.975,.075,bench)
box('Workbench | flush sterile steel insert',(-.72,0,.9675),(1.2,3.20,.015),steel,bench,.005)

# 6. Sink counter: true recessed bowl and front .415 above 1.0 uninterrupted support plane.
sink=root('sink-workcounter',{'width':4.65,'depth':2.65,'countertop_top':1.415,'floor':0,
    'sink_center':[-1.2,1.415,-.7],'front_tool_z_range':[.55,.7],
    'upright_tool_positions_xz':[[.3,-.65],[1.45,-.65]],'front_support_top':1.415})
box('Sink counter | recessed dark plinth',(0,0,.060),(4.38,2.24,.12),dark,sink,.025)
box('Sink counter | bottom board',(0,.02,.18),(4.48,2.46,.12),cream,sink,.025)
for x in [-2.19,2.19]:box('Sink counter | cream sidewall',(x,.02,.75),(.10,2.46,1.20),cream,sink,.017)
box('Sink counter | back wall',(0,1.19,.75),(4.40,.10,1.20),cream,sink,.015)
box('Sink counter | inner divider',(0,.02,.75),(.08,2.44,1.20),cream,sink,.012)
for x in [-1.46,0,1.46]:
    box('Sink counter | closed mint door',(x,-1.230,.752),(1.395,.065,1.17),mint,sink,.022)
    pull('Sink counter | brushed handle',x+.52,-1.302,.87,sink,.25)
annular_top('Sink counter | flat cream countertop',2.325,1.325,.055,.66,.445,.145,(-1.2,.7),1.415,.075,sink)
vs=[];basin_profiles=[(.485,.263,.110,1.170),(.505,.283,.116,1.176),(.607,.390,.132,1.383),
    (.627,.414,.139,1.407),(.640,.430,.142,1.415),(.660,.445,.145,1.415)]
for hx,hy,r,z in basin_profiles:vs.extend(outline(hx,hy,r,z,(-1.2,.7)))
fs=[tuple(range(40))]
for j in range(len(basin_profiles)-1):
    for i in range(40):fs.append((j*40+i,(j+1)*40+i,(j+1)*40+(i+1)%40,j*40+(i+1)%40))
basin=mesh('Sink counter | continuous recessed steel basin',vs,fs,steel,sink)
if basin.data.polygons[0].normal.z<0:
    bm=bmesh.new();bm.from_mesh(basin.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(basin.data);bm.free()
s=basin.modifiers.new('Pressed steel sheet','SOLIDIFY');s.thickness=.004;s.offset=-1
b=basin.modifiers.new('Basin edge polish','BEVEL');b.width=.003;b.segments=3
lathe('Sink counter | drain',[(1.171,.058),(1.177,.058),(1.178,.047)],chrome,sink,location=(-1.2,.7,0))
lathe('Sink counter | drain recess',[(1.1781,.027),(1.179,.027)],dark,sink,location=(-1.2,.7,0))
lathe('Sink counter | faucet foot',[(1.415,.080),(1.433,.080),(1.453,.056)],chrome,sink,location=(-1.2,1.165,0))
curve('Sink counter | continuous chrome faucet',[(-1.2,1.165,1.441),(-1.2,1.165,1.746),
    (-1.2,1.125,1.844),(-1.2,.958,1.864),(-1.2,.790,1.797),(-1.2,.790,1.735)],.038,chrome,sink)
box('Sink counter | mixer lever',(-1.072,1.162,1.474),(.19,.045,.032),chrome,sink,.014)

# Validate all root contact dimensions and manifold manufactured components before export.
bpy.context.view_layer.update();depsgraph=bpy.context.evaluated_depsgraph_get()
reports=[]
for group in roots:
    minimum=Vector((999,999,999));maximum=Vector((-999,-999,-999));non_manifold=0;triangles=0;mesh_count=0
    for o in group.children:
        evaluated=o.evaluated_get(depsgraph);geo=evaluated.to_mesh();mesh_count+=1
        for vertex in geo.vertices:
            point=evaluated.matrix_world@vertex.co
            for k in range(3):minimum[k]=min(minimum[k],point[k]);maximum[k]=max(maximum[k],point[k])
        geo.calc_loop_triangles();triangles+=len(geo.loop_triangles)
        bm=bmesh.new();bm.from_mesh(geo)
        # Bezier fill caps carry duplicate normal seams; audit geometric closure after welding.
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
        non_manifold+=sum(not e.is_manifold for e in bm.edges);bm.free()
        evaluated.to_mesh_clear()
    assert abs(minimum.z)<.00002
    # Open decorative tube caps are closed by evaluated curves; all solids must be manifold.
    assert non_manifold==0, group.name+' has '+str(non_manifold)+' open/nonmanifold edges'
    report={'asset_id':group.name,'mesh_count':mesh_count,'triangles':triangles,'min_y_gltf':minimum.z,
        'bounds_gltf':[minimum.x,minimum.z,-maximum.y,maximum.x,maximum.z,-minimum.y],
        'non_manifold_edges':non_manifold,'contact_metadata':json.loads(group['contact_metadata'])}
    group['bounds_gltf']=json.dumps(report['bounds_gltf']);reports.append(report)
    col=bpy.data.collections.new('TEMP_EXPORT');scene.collection.children.link(col)
    export_root=bpy.data.objects.new(group.name,None);col.objects.link(export_root)
    for k in group.keys():export_root[k]=group[k]
    for o in group.children:
        evaluated=o.evaluated_get(depsgraph)
        data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=depsgraph)
        copy=bpy.data.objects.new(o.name,data);col.objects.link(copy);copy.parent=export_root;copy.matrix_world=o.matrix_world.copy()
    # Join only disposable evaluated copies; glTF splits the resulting mesh by shared material.
    # Editable source parts and manufacturing modifiers remain unchanged in the .blend.
    batches=[o for o in col.objects if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in batches:o.select_set(True)
    bpy.context.view_layer.objects.active=batches[0]
    bpy.ops.object.join()
    batches[0].name=group.name+' | material-batched geometry'
    bpy.ops.object.select_all(action='DESELECT')
    for o in col.objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=PUBLIC+'/'+group.name+'.glb',export_format='GLB',use_selection=True,
        export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    for o in list(col.objects):bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.collections.remove(col)
scene['furniture_geometry_report']=json.dumps(reports)

# Studio arrangement only; exported roots retain the required zero origins.
chair.location=(-3.60,-1.30,0);cab.location=(-1.15,-1.75,0);monitor.location=(-1.15,-1.75,1.4)
holder.location=(1.05,-1.70,0);bench.location=(-2.30,2.25,0);sink.location=(2.15,2.85,0)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.003))
ground=organize(bpy.context.object,studio);ground.name='Studio floor';ground.data.materials.append(floor_mat)
bpy.ops.object.camera_add(location=(11,-15,13))
camera=organize(bpy.context.object,studio);camera.name='Furniture overview camera'
camera.rotation_euler=(Vector((0,.45,.8))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=12.9;scene.camera=camera
def area(name,loc,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=organize(bpy.context.object,studio);o.name=name;o.data.energy=power;o.data.size=size;o.data.color=color
    o.rotation_euler=(Vector((0,1,.6))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key | warm clinic softbox',(-5,-6,9),1500,7,(1,.9,.8))
area('Fill | calm window',(7,-2,8),1100,6,(.80,.92,1))
area('Rim | upper window',(1,7,8),1700,7,(1,1,.9))
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.7,.79,.72,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.25
scene.render.filepath=OUT+'/render.png'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/room-furniture.blend')
print(json.dumps({'phase':'furniture-model-export-ready','blender_version':bpy.app.version_string,
    'assets':reports,'blend':OUT+'/room-furniture.blend'}))
