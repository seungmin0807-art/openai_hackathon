"""Four original local Blender clinic furnishings. Source MIT; assets CC0-1.0.
Game units follow the existing clinic scene, not a claimed clinical standard.
No downloaded geometry/textures or remote generation services. Blender 4.5.
"""
import bpy
import bmesh
import math
import json
from mathutils import Vector
OUT='C:/dev/openai_hackathon/artifacts/blender-mcp/exam-furniture'
PUBLIC='C:/dev/openai_hackathon/public/assets/clinic/blender-candidates/exam-furniture'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name.startswith(('FURNITURE_','STUDIO_ONLY','TEMP_EXPORT')):bpy.data.collections.remove(c)
for m in list(bpy.data.materials):bpy.data.materials.remove(m)
def linear(s):
    a=[int(s[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in a)
def material(name,color,roughness=.5,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*linear(color),1)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*linear(color),1)
    p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metal;return m
cream=material('Frame | warm cream enamel','F1ECD9',.36)
cloth=material('Privacy fabric | warm ivory weave','F7F1DF',.82)
mint=material('Bed vinyl | soft sage mint','9BC4B1',.63)
peach=material('Visitor and stool upholstery | warm peach','DBA891',.67)
white=material('Pillow | warm cotton','FFF9EA',.8)
oak=material('Wood | warm honey oak','BDA076',.51)
steel=material('Metal | brushed stainless steel','CBD4CF',.28,.83)
polished=material('Metal | polished axle steel','E1E7E0',.17,.93)
rubber=material('Rubber | deep forest green','34574A',.75)
seammat=material('Piping | pale vanilla','E7DAC0',.68)
floormat=material('Studio | warm chalk','E2E3D7',.8)
# A procedural micro-weave affects shading only; glTF retains the base PBR cloth.
noise=cloth.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=210
bump=cloth.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.15;bump.inputs['Distance'].default_value=.008
cloth.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height'])
cloth.node_tree.links.new(bump.outputs['Normal'],cloth.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
studio=bpy.data.collections.new('STUDIO_ONLY');bpy.context.scene.collection.children.link(studio)
assets={};roots={};state={'current':None};surfaces=[]
def start(name):
    collection=bpy.data.collections.new('FURNITURE_'+name);bpy.context.scene.collection.children.link(collection);assets[name]=collection;state['current']=collection
    root=bpy.data.objects.new(name,None);collection.objects.link(root);roots[name]=root
    root['license']='CC0-1.0';root['units']='clinic game units';root['front_axis']='+Z in glTF';return root
def organize(o,collection=None):
    for c in list(o.users_collection):c.objects.unlink(o)
    (collection if collection else state['current']).objects.link(o);return o
def finish(o,mat,bevel=0,smooth=False):
    o.data.materials.append(mat)
    if bevel:
        b=o.modifiers.new('Manufactured edge radius','BEVEL');b.width=bevel;b.segments=5
        n=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');n.keep_sharp=True
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=smooth
    return o
def box(name,loc,size,mat,bevel=.01,collection=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=organize(bpy.context.object,collection);o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,mat,bevel)
def cylinder(name,loc,radius,depth,mat,axis=(0,0,1),verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=depth,location=loc)
    o=organize(bpy.context.object);o.name=name;o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler();return finish(o,mat,.002,True)
def mesh(name,verts,faces,mat,smooth=False,bevel=0):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);state['current'].objects.link(o)
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    return finish(o,mat,bevel,smooth)
def tube(name,points,radius,mat,cyclic=False):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=12;c.bevel_depth=radius;c.bevel_resolution=3;c.use_fill_caps=True
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    s.use_cyclic_u=cyclic;o=bpy.data.objects.new(name,c);state['current'].objects.link(o);c.materials.append(mat);return o
def spow(x,p):return (1 if x>=0 else -1)*abs(x)**p
def puffy(name,loc,size,mat,xy_power=.36,z_power=.40):
    # Closed quad latitude surface with two small triangular pole fans.
    n=64;steps=28;verts=[];rx,ry,rz=[v/2 for v in size]
    for k in range(1,steps):
        v=-math.pi/2+math.pi*k/steps;f=abs(math.cos(v))**z_power
        for j in range(n):
            a=2*math.pi*j/n
            verts.append((loc[0]+rx*f*spow(math.cos(a),xy_power),loc[1]+ry*f*spow(math.sin(a),xy_power),loc[2]+rz*spow(math.sin(v),z_power)))
    bottom=len(verts);verts.append((loc[0],loc[1],loc[2]-rz));top=len(verts);verts.append((loc[0],loc[1],loc[2]+rz))
    faces=[]
    for k in range(steps-2):
        for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
    for j in range(n):faces.append((bottom,(j+1)%n,j));faces.append((top,(steps-2)*n+j,(steps-2)*n+(j+1)%n))
    o=mesh(name,verts,faces,mat,True)
    sub=o.modifiers.new('Upholstered connected curvature','SUBSURF');sub.levels=1
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sub.name)
    # Preserve the requested clinic dimensions after actual subdivision.
    for axis in range(3):
        extent=max(v.co[axis] for v in o.data.vertices)-min(v.co[axis] for v in o.data.vertices)
        for vertex in o.data.vertices:vertex.co[axis]=loc[axis]+(vertex.co[axis]-loc[axis])*size[axis]/extent
    o['surface']='Single closed subdivided upholstery mesh';surfaces.append(o);return o
def pipe_xy(name,cx,cy,z,width,depth,power,mat,r=.009):
    pts=[]
    for j in range(96):
        a=2*math.pi*j/96;pts.append((cx+width/2*spow(math.cos(a),power),cy+depth/2*spow(math.sin(a),power),z))
    return tube(name,pts,r,mat,True)
def tapered_post(name,x,y,lower,upper,foot,top,mat,lean=0):
    verts=[]
    for z,w,offset in [(lower,foot,0),(upper,top,lean)]:
        for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]:verts.append((x+a*w/2,y+offset+b*w/2,z))
    return mesh(name,verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,False,.014)

# Caster geometry is machined/stamped structure, not spheres used as attachments.
def cp(x,y,angle,scale,v):
    a,b,z=v;c=math.cos(angle);s=math.sin(angle)
    return (x+scale*(a*c-b*s),y+scale*(a*s+b*c),scale*z)
def caster(x,y,angle,scale,label):
    axis=(math.cos(angle),math.sin(angle),0)
    box(label+' | swivel mount',(x,y,.130*scale),(.057*scale,.056*scale,.010*scale),steel,.003*scale)
    cylinder(label+' | swivel collar',(x,y,.115*scale),.019*scale,.023*scale,polished)
    polygon=[(-.017,.119),(.024,.119),(.039,.083),(.039,.039),(.005,.039),(-.017,.080)]
    for u in [-.022,.022]:
        verts=[]
        for du in [-.002,.002]:
            for v,z in polygon:verts.append(cp(x,y,angle,scale,(u+du,v,z)))
        n=len(polygon);faces=[tuple(reversed(range(n))),tuple(n+j for j in range(n))]
        faces.extend((j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n))
        mesh(label+' | fork side',verts,faces,steel,False,.002*scale)
    o=box(label+' | fork bridge',cp(x,y,angle,scale,(0,.004,.109)),(.048*scale,.031*scale,.007*scale),steel,.002*scale);o.rotation_euler.z=angle
    profiles=[(-.016,.016),(-.016,.029),(-.014,.039),(-.010,.045),(.010,.045),(.014,.039),(.016,.029),(.016,.016)]
    verts=[];n=48
    for u,r in profiles:
        for j in range(n):
            a=2*math.pi*j/n;verts.append(cp(x,y,angle,scale,(u,.019+r*math.cos(a),.045+r*math.sin(a))))
    faces=[]
    for k in range(len(profiles)):
        for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,((k+1)%len(profiles))*n+(j+1)%n,((k+1)%len(profiles))*n+j))
    tire=mesh(label+' | connected rubber tire',verts,faces,rubber,True);surfaces.append(tire);tire['floor_contact_z']=0
    center=cp(x,y,angle,scale,(0,.019,.045))
    cylinder(label+' | wheel hub',center,.020*scale,.030*scale,steel,axis)
    cylinder(label+' | axle',center,.0045*scale,.059*scale,polished,axis,32)
    for s in [-1,1]:cylinder(label+' | axle nut',cp(x,y,angle,scale,(s*.030,.019,.045)),.0065*scale,.006*scale,polished,axis,6)

start('exam-bed')
box('Bed | solid support deck',(0,0,.716),(2.15,3.6,.028),oak,.012)
for x in [-1.008,1.008]:box('Bed | side frame rail',(x,0,.590),(.134,3.6,.28),oak,.028)
for y in [-1.729,1.729]:box('Bed | end frame rail',(0,y,.59),(1.95,.142,.28),oak,.028)
for x in [-.899,.899]:
    for y in [-1.405,1.405]:
        tapered_post('Bed | tapered oak leg',x,y,.016,.598,.142,.182,oak)
        box('Bed | nonmarking foot',(x,y,.016),(.154,.154,.032),rubber,.012)
for y in [-1.405,1.405]:box('Bed | leg cross brace',(0,y,.267),(1.82,.079,.072),cream,.016)
puffy('Bed | connected mint mattress',(0,0,.855),(2.08,3.50,.25),mint,.25,.34)
pipe_xy('Bed | fitted mattress piping',0,0,.855,2.073,3.493,.25,seammat,.009)
puffy('Bed | connected cotton pillow',(0,1.15,1.08),(1.45,.80,.20),white,.44,.52)
pipe_xy('Bed | pillow sewn edge',0,1.15,1.08,1.438,.788,.44,seammat,.006)

start('stool')
# Five-leg base, low-height gas lift and soft rounded peach seat.
for j in range(5):
    angle=2*math.pi*j/5;radius=.365;x=radius*math.cos(angle);y=radius*math.sin(angle)
    length=.370;mid=length/2
    spoke=box('Stool | cast base spoke',(mid*math.cos(angle),mid*math.sin(angle),.147),(.392,.069,.031),steel,.014)
    spoke.rotation_euler.z=angle
    caster(x,y,angle+math.pi/2,1,'Stool caster '+str(j+1))
cylinder('Stool | central base boss',(0,0,.152),.095,.067,steel)
cylinder('Stool | lower gas lift sleeve',(0,0,.221),.056,.143,steel)
cylinder('Stool | piston',(0,0,.356),.034,.193,polished)
cylinder('Stool | seat support disc',(0,0,.434),.360,.031,cream)
puffy('Stool | connected peach cushion',(0,0,.486),(.96,.96,.128),peach,1,.48)
pipe_xy('Stool | stitched cushion piping',0,0,.476,.945,.945,1,seammat,.006)
tube('Stool | height lever',[(.06,0,.421),(.22,0,.421),(.26,-.045,.409)],.013,steel)
box('Stool | height lever grip',(.275,-.065,.407),(.068,.049,.028),rubber,.012)

start('visitor-chair')
puffy('Visitor | connected peach seat',(0,0,.600),(1.28,1.12,.18),peach,.36,.46)
pipe_xy('Visitor | seat piping',0,0,.595,1.268,1.108,.36,seammat,.006)
box('Visitor | underseat oak frame',(0,0,.496),(1.145,1.016,.043),oak,.016)
for x in [-.522,.522]:
    tapered_post('Visitor | front tapered leg',x,-.433,.014,.525,.092,.112,oak)
    box('Visitor | front felt glide',(x,-.433,.012),(.095,.095,.024),rubber,.009)
    tapered_post('Visitor | continuous rear leg and back post',x,.455,.012,1.793,.089,.077,oak,.033)
    box('Visitor | rear felt glide',(x,.455,.012),(.096,.096,.024),rubber,.009)
puffy('Visitor | connected peach back',(0,.455,1.26),(1.30,.16,1.18),peach,.40,.43)
for x in [-.596,.596]:
    for y in [-.34,.35]:box('Visitor | armrest support',(x,y,.825),(.058,.063,.285),oak,.016)
    box('Visitor | gently rounded oak armrest',(x,.005,.992),(.078,.91,.066),oak,.028)

start('privacy-screen')
for x in [-1.055,1.055]:
    cylinder('Screen | cream upright',(x,0,1.94),.045,3.52,cream)
    box('Screen | stable fore-aft caster base',(x,0,.174),(.061,.76,.045),cream,.014)
    for y in [-.321,.321]:caster(x,y,0,1.2,'Screen caster')
cylinder('Screen | top continuous steel rail',(0,0,3.621),.037,2.11,steel,(1,0,0))
cylinder('Screen | lower spreader rail',(0,0,.405),.027,2.11,steel,(1,0,0))
cols=80;rows=32;verts=[]
def fold_y(x,z):
    envelope=.83+.17*math.sin(math.pi*(z-.47)/3.0)
    return .055*envelope*math.sin(8*math.pi*(x+.985)/1.97)+.008*math.sin(math.pi*(z-.47)/3)
for k in range(rows+1):
    z=.47+3.0*k/rows
    for j in range(cols+1):
        x=-.985+1.97*j/cols;verts.append((x,fold_y(x,z),z))
faces=[]
for k in range(rows):
    for j in range(cols):
        a=k*(cols+1)+j;faces.append((a,a+1,a+cols+2,a+cols+1))
sheet=mesh('Screen | continuous folded cloth panel',verts,faces,cloth,True)
sub=sheet.modifiers.new('Subdivided hanging fabric','SUBSURF');sub.levels=1;sub.render_levels=1
sol=sheet.modifiers.new('Real sewn cloth thickness','SOLIDIFY');sol.thickness=.009;sol.offset=0;sol.use_rim=True
sheet['surface']='One connected curved quad sheet with real thickness';surfaces.append(sheet)
for z,label in [(.47,'lower'),(3.47,'upper')]:
    pts=[]
    for j in range(121):
        x=-.985+1.97*j/120;pts.append((x,fold_y(x,z)-.005,z))
    tube('Screen | '+label+' sewn hem',pts,.008,seammat)
for j in range(9):
    x=-.90+1.8*j/8
    bpy.ops.mesh.primitive_torus_add(major_radius=.078,minor_radius=.007,major_segments=40,minor_segments=10,location=(x,0,3.591))
    ring=organize(bpy.context.object);ring.name='Screen | sliding curtain ring';ring.rotation_euler.y=math.pi/2;finish(ring,steel,0,True)
    box('Screen | stitched top fabric loop',(x,fold_y(x,3.47),3.49),(.027,.013,.065),cloth,.004)

# Assign a genuine floor-centred root to each furniture asset before export.
for name,collection in assets.items():
    root=roots[name]
    for obj in collection.objects:
        if obj!=root:obj.parent=root
bpy.context.view_layer.update();depsgraph=bpy.context.evaluated_depsgraph_get()
audit=[]
for o in surfaces:
    bm=bmesh.new();bm.from_object(o,depsgraph);pending=set(bm.verts);components=0
    while pending:
        components+=1;stack=[pending.pop()]
        while stack:
            for edge in stack.pop().link_edges:
                for v in edge.verts:
                    if v in pending:pending.remove(v);stack.append(v)
    record={'object':o.name,'connected_components':components,'non_manifold_edges':sum(not e.is_manifold for e in bm.edges),'vertices':len(bm.verts),'faces':len(bm.faces)}
    audit.append(record);bm.free()
assert all(a['connected_components']==1 and a['non_manifold_edges']==0 for a in audit)
exports=[]
for name,collection in assets.items():
    temp=bpy.data.collections.new('TEMP_EXPORT');bpy.context.scene.collection.children.link(temp)
    root=bpy.data.objects.new(name,None);temp.objects.link(root);root['license']='CC0-1.0';root['units']='clinic game units';root['front_axis']='+Z'
    root['top_surface_height']={'exam-bed':.98,'stool':.55,'visitor-chair':.69,'privacy-screen':3.7}[name]
    root['floor_y']=0;root['origin']='Floor-centred XZ; front +Z';root['export_batching']='Static evaluated geometry grouped by material; original manufactured parts retained in Blender'
    bounds=[];triangles=0;count=0;groups={}
    for obj in collection.objects:
        if obj.type not in {'MESH','CURVE'}:continue
        evaluated=obj.evaluated_get(depsgraph);data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=depsgraph)
        copy=bpy.data.objects.new(obj.name,data);temp.objects.link(copy);copy.parent=root;copy.matrix_world=obj.matrix_world.copy()
        for key in obj.keys():copy[key]=obj[key]
        label=' | '.join(m.name for m in data.materials);groups.setdefault(label,[]).append(copy)
        data.calc_loop_triangles();triangles+=len(data.loop_triangles);count+=1
        bounds.extend(copy.matrix_world@v.co for v in data.vertices)
    low=[min(v[i] for v in bounds) for i in range(3)];high=[max(v[i] for v in bounds) for i in range(3)]
    assert abs(low[2])<.00001,(name,low)
    # Batch static export parts by identical material, preserving evaluated normals.
    for label,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        batched=bpy.context.view_layer.objects.active;batched.name=name+' | '+label
        for key in list(batched.keys()):del batched[key]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in temp.objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=PUBLIC+'/'+name+'.glb',export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
    exports.append({'name':name,'original_parts':count,'batched_meshes':len(groups),'triangles':triangles,'bounds_blender':low+high})
    for obj in list(temp.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(temp)

# Gallery only: reusable GLBs were exported with every root at 0,0,0.
roots['exam-bed'].location=(-1.65,-.16,0)
roots['stool'].location=(-.40,-2.57,0)
roots['visitor-chair'].location=(1.72,-1.25,0)
roots['privacy-screen'].location=(1.38,1.10,0)
box('Studio | floor',(0,0,-.031),(200,200,.06),floormat,0,studio)
def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(8,-12,8.3));cam=organize(bpy.context.object,studio);cam.name='Camera | clinic furniture group'
cam.data.type='ORTHO';cam.data.ortho_scale=7.35;aim(cam,(0,-.30,1.29));bpy.context.scene.camera=cam
def area(name,loc,power,color,size):
    bpy.ops.object.light_add(type='AREA',location=loc);o=organize(bpy.context.object,studio);o.name=name;o.data.energy=power;o.data.color=linear(color);o.data.shape='DISK';o.data.size=size;aim(o,(0,0,1))
area('Key | warm large softbox',(-5,-6,9),1800,'FFF5E7',6)
area('Fill | soft sage',(6,-2,6),1250,'EDF8EE',5)
area('Rim | brushed metal highlight',(0,5,7),1800,'FFF8EA',4)
scene=bpy.context.scene;scene.world.color=(.30,.30,.30);scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.render.filepath=OUT+'/render.png'
scene.view_settings.view_transform='AgX';scene.render.film_transparent=False
result={'status':'four_exam_furnishings_modelled_exported','exports':exports,'connected_surface_audit':audit,
 'source':'Original local Blender modelling','source_license':'MIT','asset_license':'CC0-1.0','units':'existing clinic game units','front_gltf':'+Z','render_pending':True}
scene['furniture_audit_json']=json.dumps(result)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/exam-furniture.blend',compress=True)
print(json.dumps(result))
