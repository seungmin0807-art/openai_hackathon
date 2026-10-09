"""Original locally modelled clinic trolley; source MIT, geometry CC0-1.0.
Blender 4.5.14. No downloaded meshes, textures, AI media or remote services.
Z-up source units: metres; front -Y. Exported glTF is Y-up, front +Z.
"""
import bpy
import bmesh
import math
import json
from mathutils import Vector

OUT='C:/dev/openai_hackathon/artifacts/blender-mcp/trolley'
PUBLIC='C:/dev/openai_hackathon/public/assets/clinic/blender-candidates/trolley'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name.startswith(('TROLLEY_ASSET','STUDIO_ONLY','TEMP_TROLLEY_EXPORT')):
        bpy.data.collections.remove(collection)
for material in list(bpy.data.materials):bpy.data.materials.remove(material)

def linear(color):
    rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)
def material(name,color,roughness=.45,metallic=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*linear(color),1)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*linear(color),1)
    p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metallic
    return m
cream=material('Frame | warm porcelain enamel','F4EEDC',.31)
mint=material('Drawer | soft jade enamel','84B5A1',.36)
pad=material('Shelf mat | pale sage silicone','BCD2C3',.68)
rubber=material('Caster tire | dark forest non-marking rubber','244D43',.74)
steel=material('Tray | brushed stainless steel','CAD4D1',.31,.86)
polished=material('Handle and axle | polished steel','DEE4DF',.18,.9)
dark=material('Drawer gaps | deep sage','54786A',.62)
paper=material('Drawer label | warm ivory','FFF9E9',.76)
floor=material('Studio | warm plaster','E6E5D8',.77)
asset=bpy.data.collections.new('TROLLEY_ASSET');bpy.context.scene.collection.children.link(asset)
studio=bpy.data.collections.new('STUDIO_ONLY');bpy.context.scene.collection.children.link(studio)

def organize(o,collection=asset):
    for c in list(o.users_collection):c.objects.unlink(o)
    collection.objects.link(o);return o
def finish(o,mat,bevel=0,smooth=False):
    o.data.materials.append(mat)
    if bevel:
        b=o.modifiers.new('Manufactured edge radius','BEVEL');b.width=bevel;b.segments=4
        n=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');n.keep_sharp=True
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=smooth
    return o
def box(name,location,size,mat,bevel=.003,collection=asset):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=organize(bpy.context.object,collection);o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,mat,bevel)
def cylinder(name,location,radius,depth,mat,axis=(0,0,1),vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=location)
    o=organize(bpy.context.object);o.name=name;o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler()
    return finish(o,mat,.0012,True)
def mesh(name,verts,faces,mat,bevel=0,smooth=False):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);asset.objects.link(o)
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    return finish(o,mat,bevel,smooth)
def tube(name,points,radius,mat):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=14;data.bevel_depth=radius;data.bevel_resolution=4;data.use_fill_caps=True
    s=data.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,data);asset.objects.link(o);data.materials.append(mat);return o

def rounded_ring(width,depth,radius,z,cx=0,cy=0):
    hw=width/2;hd=depth/2;verts=[]
    centers=[(hw-radius,hd-radius),(-hw+radius,hd-radius),(-hw+radius,-hd+radius),(hw-radius,-hd+radius)]
    for i,(x,y) in enumerate(centers):
        for j in range(9):
            a=math.radians(90*i+90*j/8)
            verts.append((cx+x+radius*math.cos(a),cy+y+radius*math.sin(a),z))
    return verts

def formed_tray(name,location,width,depth,height,mat,wall=.0018,corner=.021):
    cx,cy,base=location
    # Sheet cross section: underside, outer wall, rolled rim, inside wall, bowl floor.
    profiles=[(width-.012,depth-.012,corner-.003,base),
       (width-.003,depth-.003,corner,base+.004),
       (width,depth,corner,base+height-.0014),
       (width-.0014,depth-.0014,corner-.0007,base+height),
       (width-2*wall,depth-2*wall,corner-wall,base+height-.0012),
       (width-.014,depth-.014,corner-.004,base+.0038)]
    verts=[]
    for w,d,r,z in profiles:verts.extend(rounded_ring(w,d,r,z,cx,cy))
    n=36;faces=[]
    for k in range(len(profiles)-1):
        for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
    faces.extend([tuple(reversed(range(n))),tuple((len(profiles)-1)*n+j for j in range(n))])
    o=mesh(name,verts,faces,mat,bevel=.0007,smooth=True)
    o['surface']='Closed formed-sheet shell with inner floor and rolled rim';return o

# Four continuous corner uprights; frame joins touch the underside of the counter.
for x in [-.266,.266]:
    for y in [-.174,.174]:
        o=box('Frame | upright', (x,y,.461),(.028,.028,.652),cream,.006)
        cylinder('Frame | caster mount screw',(x,y,.148),.009,.012,polished)
box('Counter | rounded enamel top',(0,0,.775),(.648,.458,.026),cream,.014)
for x in [-.286,.286]:box('Frame | upper side rail',(x,0,.746),(.025,.395,.028),cream,.006)
for y in [-.185,.185]:box('Frame | upper cross rail',(0,y,.746),(.574,.024,.027),cream,.006)

# Lower and middle shelves are shallow formed metal pans, with washable inset mats.
for label,z in [('lower',.216),('middle',.434)]:
    formed_tray('Shelf | '+label+' connected enamel pan',(0,0,z),.584,.398,.032,cream,.0024,.022)
    box('Shelf | '+label+' silicone mat',(0,0,z+.005),(.548,.362,.0038),pad,.017)
    for y in [-.168,.168]:box('Frame | '+label+' supporting cross rail',(0,y,z-.01),(.536,.021,.018),cream,.004)

# One closed sliding drawer. Shell, inner drawer box and face are distinct manufactured parts.
for x in [-.283,.283]:box('Drawer case | side',(x,0,.661),(.014,.392,.152),cream,.004)
box('Drawer case | rear',(0,.187,.661),(.552,.014,.152),cream,.004)
box('Drawer case | bottom',(0,0,.588),(.574,.391,.012),cream,.003)
box('Drawer case | top',(0,0,.734),(.574,.391,.012),cream,.003)
box('Drawer | shadow recess',(0,-.197,.66),(.55,.008,.138),dark,.003)
box('Drawer | mint front',(0,-.207,.660),(.544,.018,.126),mint,.009)
box('Drawer | inner floor',(0,.002,.607),(.525,.350,.008),cream,.003)
for x in [-.263,.263]:box('Drawer | inner side',(x,.002,.651),(.009,.35,.096),cream,.0025)
box('Drawer | inner rear',(0,.173,.651),(.525,.009,.096),cream,.0025)
tube('Drawer | steel pull',[(-.076,-.222,.671),(-.076,-.249,.671),(-.064,-.256,.671),(.064,-.256,.671),(.076,-.249,.671),(.076,-.222,.671)],.005,polished)
box('Drawer | label holder',(.186,-.218,.666),(.080,.004,.025),steel,.002)
box('Drawer | blank paper label',(.186,-.2205,.666),(.068,.001,.016),paper,.001)

# Side push handles: bent tubular steel with moulded non-slip grip sleeves.
for sign,label in [(-1,'left'),(1,'right')]:
    x=sign*.350
    tube('Handle | '+label+' continuous bent tube',[(sign*.305,-.130,.792),(x,-.130,.826),(x,-.114,.853),
      (x,-.095,.853),(x,.095,.853),(x,.114,.853),(x,.130,.826),(sign*.305,.130,.792)],.0085,polished)
    cylinder('Handle | '+label+' forest rubber grip',(x,0,.853),.012,.184,rubber,axis=(0,1,0))
    for y in [-.101,.101]:cylinder('Handle | '+label+' end ferrule',(x,y,.853),.0123,.011,polished,axis=(0,1,0))

# Removable top trays lie on silicone isolation feet and leave a clear instrument surface.
for cx,cy,width,depth,label in [(-.09,.009,.384,.274,'main'),(.234,.004,.122,.192,'small')]:
    for dx in [-width*.32,width*.32]:
        for dy in [-depth*.31,depth*.31]:box('Tray | '+label+' support pad',(cx+dx,cy+dy,.7905),(.016,.016,.005),rubber,.004)
    formed_tray('Tray | '+label+' brushed steel',(cx,cy,.793),width,depth,.027,steel,.0015,.018)

# Real caster assemblies: swivel mounting plate, stem, two fork sides, axle, hub and tire.
def caster_point(x,y,angle,local):
    u,v,z=local;c=math.cos(angle);s=math.sin(angle)
    return (x+u*c-v*s,y+u*s+v*c,z)
def caster_plate(x,y,angle,label,u):
    # Side profile stamped from sheet, top bridge joins both fork arms above the tire.
    polygon=[(-.017,.119),(.024,.119),(.039,.083),(.039,.039),(.005,.039),(-.017,.080)]
    verts=[]
    for du in [-.002,.002]:
        for v,z in polygon:verts.append(caster_point(x,y,angle,(u+du,v,z)))
    n=len(polygon);faces=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    return mesh('Caster '+label+' | fork side',verts,faces,steel,.0025)
def tire(x,y,angle,label):
    # Closed revolved cross-section: rounded tread, sidewalls and central hub opening.
    profile=[(-.016,.016),(-.016,.029),(-.014,.039),(-.010,.045),(.010,.045),(.014,.039),(.016,.029),(.016,.016)]
    verts=[];n=56
    for u,r in profile:
        for j in range(n):
            a=2*math.pi*j/n;verts.append(caster_point(x,y,angle,(u,.019+r*math.cos(a),.045+r*math.sin(a))))
    faces=[]
    for k in range(len(profile)):
        for j in range(n):faces.append((k*n+j,k*n+(j+1)%n,((k+1)%len(profile))*n+(j+1)%n,((k+1)%len(profile))*n+j))
    o=mesh('Caster '+label+' | continuous moulded tire',verts,faces,rubber,smooth=True)
    o['contact_z_m']=0;return o

for label,x,y,degrees in [('front left',-.266,-.174,-18),('front right',.266,-.174,15),
                          ('rear left',-.266,.174,0),('rear right',.266,.174,0)]:
    angle=math.radians(degrees);axis=(math.cos(angle),math.sin(angle),0)
    box('Caster '+label+' | swivel mount plate',(x,y,.130),(.057,.056,.010),steel,.003)
    cylinder('Caster '+label+' | swivel collar',(x,y,.115),.019,.023,polished)
    for u in [-.022,.022]:caster_plate(x,y,angle,label,u)
    bridge=box('Caster '+label+' | fork bridge',caster_point(x,y,angle,(0,.004,.109)),(.048,.031,.007),steel,.002)
    bridge.rotation_euler.z=angle
    center=caster_point(x,y,angle,(0,.019,.045))
    tire(x,y,angle,label)
    cylinder('Caster '+label+' | steel hub',center,.020,.030,steel,axis)
    cylinder('Caster '+label+' | through axle',center,.0045,.058,polished,axis,32)
    for sign in [-1,1]:
        hubface=caster_point(x,y,angle,(sign*.017,.019,.045))
        cylinder('Caster '+label+' | axle bearing',hubface,.011,.0045,polished,axis,40)
        bolt=caster_point(x,y,angle,(sign*.0295,.019,.045))
        cylinder('Caster '+label+' | hexagonal axle nut',bolt,.0065,.0055,polished,axis,6)
    if label.startswith('front'):
        brake=box('Caster '+label+' | brake lever',caster_point(x,y,angle,(0,-.019,.090)),(.029,.034,.006),dark,.003)
        brake.rotation_euler.z=angle

# Audit the formed trays and revolved tires as actual closed connected meshes.
audit=[]
for o in asset.objects:
    if o.type!='MESH' or not ('connected enamel pan' in o.name or 'brushed steel' in o.name or 'continuous moulded tire' in o.name):continue
    bm=bmesh.new();bm.from_object(o,bpy.context.evaluated_depsgraph_get());pending=set(bm.verts);components=0
    while pending:
        components+=1;stack=[pending.pop()]
        while stack:
            for edge in stack.pop().link_edges:
                for v in edge.verts:
                    if v in pending:pending.remove(v);stack.append(v)
    record={'object':o.name,'connected_components':components,'non_manifold_edges':sum(not e.is_manifold for e in bm.edges),'vertices':len(bm.verts),'faces':len(bm.faces)}
    audit.append(record);bm.free()
assert all(a['connected_components']==1 and a['non_manifold_edges']==0 for a in audit)

# Static glTF export uses evaluated bevel/normals geometry and excludes the studio.
depsgraph=bpy.context.evaluated_depsgraph_get();temp=bpy.data.collections.new('TEMP_TROLLEY_EXPORT');bpy.context.scene.collection.children.link(temp)
root=bpy.data.objects.new('ClinicTrolley',None);temp.objects.link(root)
root['license']='CC0-1.0';root['source']='Original local Blender Python modelling';root['units']='metres';root['front_axis']='+Z in glTF'
copies=[];triangles=0;bounds=[]
for o in asset.objects:
    if o.type not in {'MESH','CURVE'}:continue
    evaluated=o.evaluated_get(depsgraph);data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=depsgraph)
    copy=bpy.data.objects.new(o.name,data);temp.objects.link(copy);copy.parent=root;copy.matrix_world=o.matrix_world.copy()
    for key in o.keys():copy[key]=o[key]
    data.calc_loop_triangles();triangles+=len(data.loop_triangles);copies.append(copy)
    bounds.extend(copy.matrix_world@v.co for v in data.vertices)
bpy.ops.object.select_all(action='DESELECT')
for o in temp.objects:o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=PUBLIC+'/trolley.glb',export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
lo=[min(v[i] for v in bounds) for i in range(3)];hi=[max(v[i] for v in bounds) for i in range(3)]
assert abs(lo[2])<.000001,lo
for o in list(temp.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.data.collections.remove(temp)

# Warm product studio. Lighting and ground are present only in the editable source.
box('Studio | floor',(0,0,-.027),(200,200,.05),floor,0,studio)
def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(1.48,-2.35,1.36));camera=organize(bpy.context.object,studio);camera.name='Camera | trolley three quarter'
camera.data.type='ORTHO';camera.data.ortho_scale=1.16;aim(camera,(0,0,.435));bpy.context.scene.camera=camera
def area(name,location,power,color,size):
    bpy.ops.object.light_add(type='AREA',location=location);o=organize(bpy.context.object,studio);o.name=name;o.data.energy=power;o.data.color=linear(color);o.data.shape='DISK';o.data.size=size;aim(o,(0,0,.42))
area('Key | warm softbox',(-2,-3,3.5),270,'FFF5E8',2.6)
area('Fill | sage softbox',(2,-.5,2),180,'ECF9F1',2)
area('Rim | stainless highlight',(-.2,2,2.5),260,'FFFAEF',2)
scene=bpy.context.scene;scene.world.color=(.32,.32,.32);scene.render.engine='CYCLES'
scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.render.filepath=OUT+'/render.png';scene.render.film_transparent=False
result={'status':'trolley_modelled_exported_ready_to_render','objects':len(asset.objects),'triangles':triangles,
 'bounds_blender_m':lo+hi,'watertight_surface_audit':audit,'caster_ground_contact_z_m':lo[2],
 'blend':OUT+'/trolley.blend','glb':PUBLIC+'/trolley.glb','asset_license':'CC0-1.0','source_license':'MIT'}
scene['trolley_audit_json']=json.dumps(result);scene['render_pending']=True
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/trolley.blend',compress=True)
print(json.dumps(result))
