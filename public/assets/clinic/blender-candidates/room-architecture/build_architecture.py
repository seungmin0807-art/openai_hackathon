"""Original editable Blender architecture geometry. Script MIT, geometry CC0-1.0."""
import bpy
import bmesh
import math
import json
from mathutils import Vector

OUT='C:/dev/openai_hackathon/artifacts/blender-mcp/room-architecture'
PUBLIC='C:/dev/openai_hackathon/public/assets/clinic/blender-candidates/room-architecture'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):bpy.data.collections.remove(col)
scene=bpy.context.scene
COL=bpy.data.collections.new('EDITABLE_ARCHITECTURE')
scene.collection.children.link(COL)

def material(name,color,metal=0,rough=.5):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1)
    m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

cream=material('Warm ivory powder coat',(.79,.765,.65),0,.47)
mint=material('Soft sage trim',(.27,.45,.36),0,.52)
glass=material('Pale frosted window glass',(.64,.79,.76),.06,.27)
peach=material('Peach woven curtain',(.73,.42,.31),0,.86)
steel=material('Satin curtain rail',(.46,.48,.46),.75,.28)
oak=material('Honey oak sill',(.49,.30,.14),0,.48)
ink=material('Deep forest poster print',(.025,.12,.075),0,.8)
paper=material('Neutral warm poster paper',(.92,.91,.80),0,.8)
leafmat=material('Broad leaves green',(.16,.36,.18),0,.49)
leaflight=material('Young leaves green',(.25,.44,.24),0,.51)
soil=material('Potting soil',(.10,.055,.027),0,1)
potmat=material('Peach ceramic glaze',(.71,.40,.30),0,.32)

def parent(name,asset):
    o=bpy.data.objects.new(name,None);COL.objects.link(o)
    o['asset_id']=asset;o['license']='CC0-1.0';o['units']='meters'
    o['source']='Original local Blender Python geometry, no downloaded assets'
    o['front_axis']='+Z in glTF';o['origin']='bottom center'
    return o

def finish(o,name,mat,p):
    o.name=name;o.data.materials.append(mat)
    if p:o.parent=p
    return o

def box(name,loc,dim,mat,p,bevel=.018):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object
    o.scale=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat,p)
    if bevel:
        mod=o.modifiers.new('Manufactured rounded edges','BEVEL');mod.width=bevel;mod.segments=3
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return o

def tube(name,points,radius,mat,p):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=12
    c.bevel_depth=radius;c.bevel_resolution=3;c.use_fill_caps=True
    spline=c.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for bp,co in zip(spline.bezier_points,points):
        bp.co=co;bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);COL.objects.link(o);finish(o,name,mat,p);return o

def cylinder(name,a,b,r,mat,p):
    a=Vector(a);b=Vector(b);v=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=v.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_euler=v.to_track_quat('Z','Y').to_euler()
    finish(o,name,mat,p)
    for poly in o.data.polygons:poly.use_smooth=True
    mod=o.modifiers.new('Rounded machining edge','BEVEL');mod.width=min(.008,r*.17);mod.segments=3
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o

def sheet(name,vertices,faces,mat,p,thickness):
    me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update()
    o=bpy.data.objects.new(name,me);COL.objects.link(o);finish(o,name,mat,p)
    for poly in me.polygons:poly.use_smooth=True
    s=o.modifiers.new('Continuous material thickness','SOLIDIFY');s.thickness=thickness;s.offset=0
    return o

window=parent('WindowCurtains','window-curtains')
# A complete frame with four panes; all dimensions are game-local meters.
box('Window | oak sill', (0,-.12,.05),(3.82,.37,.10),oak,window,.025)
for x in [-1.745,1.745]:box('Window | vertical frame', (x,0,1.40),(.11,.14,2.60),cream,window,.018)
for z in [.155,2.645]:box('Window | horizontal frame',(0,0,z),(3.60,.14,.11),cream,window,.018)
box('Window | central mullion',(0,-.004,1.40),(.085,.10,2.48),cream,window,.012)
box('Window | cross mullion',(0,-.008,1.38),(3.40,.10,.070),cream,window,.01)
for x in [-.86,.86]:
    for z in [.78,2.02]:box('Window | frosted glass pane',(x,.025,z),(1.65,.035,1.18),glass,window,.009)
box('Window | latch plate',(.12,-.082,1.25),(.058,.028,.19),mint,window,.013)
box('Window | latch handle',(.15,-.108,1.31),(.11,.041,.028),steel,window,.009)
cylinder('Curtain | continuous rod',(-2.27,-.15,2.91),(2.27,-.15,2.91),.024,steel,window)
for x in [-2.27,2.27]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=.03,location=(x,-.15,2.91))
    finish(bpy.context.object,'Curtain | finial',cream,window)
for x in [-1.72,1.72]:
    box('Curtain | wall fixing',(x,.035,2.86),(.09,.06,.18),cream,window,.016)
    tube('Curtain | rod support',[(x,0,2.84),(x,-.15,2.82),(x,-.15,2.91)],.016,steel,window)
curtains=[]
for side in [-1,1]:
    vertices=[];faces=[];nx=72;nz=28
    for j in range(nz+1):
        t=j/nz;z=.20+2.59*t
        for i in range(nx+1):
            u=i/nx;x=side*(1.28+.86*u)
            # Fabric pleats are one uninterrupted sheet, not stacked cylinders.
            depth=-.16-.055*math.cos(u*math.pi*14)*(1-.12*t)
            depth+=.016*math.sin(t*math.pi)*math.sin(u*math.pi*2)
            vertices.append((x,depth,z+.016*(1-t)*math.cos(u*math.pi*14)))
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
    o=sheet('Curtain | continuous pleated cloth '+str(side),vertices,faces,peach,window,.007)
    curtains.append(o)
    for i in range(8):
        u=i/7;x=side*(1.28+.86*u)
        bpy.ops.mesh.primitive_torus_add(major_radius=.043,minor_radius=.008,major_segments=20,minor_segments=8,location=(x,-.15,2.861),rotation=(0,math.pi/2,0))
        finish(bpy.context.object,'Curtain | hanging ring',steel,window)
        tube('Curtain | fabric hook',[(x,-.15,2.832),(x,-.15,2.80),(x,-.16-.055*math.cos(u*math.pi*14),2.775)],.005,steel,window)
window['overall_width']=4.6;window['note']='Decorative frosted glass and connected pleated fabric'

chart=parent('EyeChart','eye-chart')
chart['note']='Decorative E-shaped rows; not a clinical diagnostic chart'
box('Poster | cream backing',(0,.004,.35),(1.15,.060,.70),cream,chart,.026)
box('Poster | paper',(0,-.03,.35),(1.07,.007,.62),paper,chart,.009)
for x in [-.55,.55]:box('Poster | side frame',(x,-.047,.35),(.045,.020,.67),oak,chart,.010)
for z in [.022,.678]:box('Poster | horizontal frame',(0,-.047,z),(1.10,.020,.045),oak,chart,.010)
box('Poster | sage header',(0,-.040,.588),(.80,.006,.050),mint,chart,.013)
for row,(z,count,height) in enumerate([(.45,4,.105),(.28,5,.082),(.145,6,.059)]):
    for n in range(count):
        glyph=bpy.data.objects.new('Poster | E glyph',None);COL.objects.link(glyph);glyph.parent=chart
        glyph.location=((n-(count-1)/2)*(.15 if count>4 else .19),-.042,z)
        glyph.rotation_euler[1]=([0,math.pi/2,math.pi,3*math.pi/2][(n+row)%4])
        width=height*.61;stroke=height*.17
        box('Poster | E stem',(-width/2+stroke/2,0,0),(stroke,.004,height),ink,glyph,.001)
        for zz in [-height/2+stroke/2,0,height/2-stroke/2]:
            box('Poster | E bar',(stroke/2,0,zz),(width-stroke,.004,stroke),ink,glyph,.001)

plant=parent('PottedPlant','plant')
profile=[(.18,0),(.192,.024),(.25,.43),(.257,.46),(.245,.48),(.228,.466),(.229,.434),(.178,.070)]
vertices=[];faces=[];segments=64
for r,z in profile:
    for i in range(segments):
        theta=2*math.pi*i/segments;vertices.append((r*math.cos(theta),r*math.sin(theta),z))
for j in range(len(profile)-1):
    for i in range(segments):
        k=(i+1)%segments;faces.append((j*segments+i,j*segments+k,(j+1)*segments+k,(j+1)*segments+i))
faces.append(tuple(reversed(range(segments))))
faces.append(tuple((len(profile)-1)*segments+i for i in range(segments)))
me=bpy.data.meshes.new('Pot | continuous hollow glazed vessel');me.from_pydata(vertices,[],faces);me.update()
pot=bpy.data.objects.new(me.name,me);COL.objects.link(pot);finish(pot,me.name,potmat,plant)
for poly in me.polygons:poly.use_smooth=True
cylinder('Pot | visible soil',(0,0,.423),(0,0,.443),.225,soil,plant)
leaves=[]
for index,(angle,height,length,width) in enumerate([(0,1.17,.39,.25),(1.22,1.30,.32,.23),(2.57,1.11,.37,.26),(3.75,1.23,.36,.23),(5.05,1.09,.35,.26)]):
    direction=Vector((math.cos(angle),math.sin(angle),0));side=Vector((-math.sin(angle),math.cos(angle),0))
    base=Vector((direction.x*.035,direction.y*.035,.432))
    leafstart=Vector((direction.x*.045,direction.y*.045,height-.36))
    tube('Plant | continuous curved stem '+str(index),[base,base+Vector((0,0,.19)),leafstart],.008,leaflight,plant)
    vertices=[];faces=[];nu=24;nv=8
    for i in range(nu+1):
        t=i/nu
        center=leafstart+direction*(length*t*.91)+Vector((0,0,.36*math.sin(t*math.pi*.60)))
        breadth=width*math.sin(math.pi*t)**.70
        for j in range(nv+1):
            s=j/nv*2-1
            co=center+side*(breadth*s*.5)+Vector((0,0,-.034*s*s*math.sin(math.pi*t)))
            vertices.append(tuple(co))
    for i in range(nu):
        for j in range(nv):
            a=i*(nv+1)+j;faces.append((a,a+nv+1,a+nv+2,a+1))
    leaf=sheet('Plant | continuous broad leaf '+str(index),vertices,faces,leaflight if index%2 else leafmat,plant,.005)
    # Collapse each leaf-tip seam to keep a clean closed Solidify result.
    bm=bmesh.new();bm.from_mesh(leaf.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bm.to_mesh(leaf.data);bm.free();leaves.append(leaf)
    tube('Plant | leaf midrib '+str(index),[leafstart+Vector((0,0,.004)),leafstart+direction*(length*.46)+Vector((0,0,.284)),leafstart+direction*(length*.86)+Vector((0,0,.352))],.003,leaflight,plant)

# Export each prop individually at its intended bottom-centered origin.
depsgraph=bpy.context.evaluated_depsgraph_get();audit=[];results=[]
for obj in curtains+[pot]+leaves:
    bm=bmesh.new();bm.from_object(obj,depsgraph)
    pending=set(bm.verts);components=0
    while pending:
        components+=1;stack=[pending.pop()]
        while stack:
            for edge in stack.pop().link_edges:
                for vert in edge.verts:
                    if vert in pending:pending.remove(vert);stack.append(vert)
    audit.append({'object':obj.name,'connected_components':components,'non_manifold_edges':sum(not e.is_manifold for e in bm.edges),'vertices':len(bm.verts)})
    bm.free()
assert all(a['connected_components']==1 and a['non_manifold_edges']==0 for a in audit),audit
for src in [window,chart,plant]:
    temp=bpy.data.collections.new('TEMP_EXPORT');scene.collection.children.link(temp)
    root=bpy.data.objects.new(src.name,None);temp.objects.link(root)
    for key in src.keys():root[key]=src[key]
    triangles=0;count=0
    for obj in src.children_recursive:
        if obj.type not in {'MESH','CURVE'}:continue
        ev=obj.evaluated_get(depsgraph)
        mesh=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=depsgraph)
        mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles)
        copy=bpy.data.objects.new(obj.name,mesh);temp.objects.link(copy);copy.parent=root;copy.matrix_world=obj.matrix_world.copy();count+=1
    # Batch static parts by material to avoid dozens of tiny game draw calls.
    # The editable Blender originals keep their separate construction parts.
    material_batches={}
    for obj in list(temp.objects):
        if obj.type=='MESH':material_batches.setdefault(obj.data.materials[0].name,[]).append(obj)
    for label,objects in material_batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        objects[0].name=src.name+' | '+label
    bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
    for obj in temp.objects:obj.select_set(True)
    path=PUBLIC+'/'+src['asset_id']+'.glb'
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
    results.append({'asset':src['asset_id'],'manufactured_parts':count,'mesh_count':len(material_batches),'triangles':triangles,'path':path})
    for obj in list(temp.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(temp)

# A small local studio with all three assets, excluded from the exported files.
window.location=(-1.15,.35,0);chart.location=(1.55,.35,1.52);plant.location=(1.63,-.15,0)
studio=parent('STUDIO_ONLY','studio')
floor=material('Warm studio floor',(.76,.73,.63),0,.82)
wall=material('Quiet cream wall',(.83,.80,.71),0,.82)
box('Studio | floor',(0,0,-.06),(18,18,.10),floor,studio,.02)
box('Studio | backdrop',(0,.53,2.0),(10,.12,4.0),wall,studio,.02)
world=bpy.data.worlds.new('Warm daylight world') if not scene.world else scene.world
scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.74,.79,.78,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.35
for name,loc,power,size in [('Large softbox',(-3,-4,5),650,5),('Fill',(4,-3,3),350,4)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.name=name;light.data.energy=power;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((0,0,1.3))-light.location).to_track_quat('-Z','Y').to_euler();light.parent=studio
bpy.ops.object.camera_add(location=(5.5,-10,4.6));camera=bpy.context.object
camera.rotation_euler=(Vector((-.35,0,1.50))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=6.5;scene.camera=camera;camera.parent=studio
scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=-.35
scene.render.image_settings.file_format='PNG';scene.render.filepath=OUT+'/render.png'
scene['asset_license']='CC0-1.0';scene['script_license']='MIT';scene['external_generation_calls']=0
scene['topology_audit']=json.dumps(audit)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/architecture.blend')
print(json.dumps({'phase':'architecture_exported','exports':results,'topology_audit':audit}))
