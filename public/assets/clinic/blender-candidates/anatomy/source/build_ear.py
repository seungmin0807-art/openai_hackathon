"""Native rabbit pinna derivative plus symbolic small canal/eardrum, local MCP.
Quaternius Rabbit_Bald derivative CC0; added geometry CC0; script MIT.
"""
import bpy, bmesh, math, json
from mathutils import Vector
WORK='C:/dev/openai_hackathon/artifacts/blender-mcp/anatomy/ear'
PUBLIC='C:/dev/openai_hackathon/public/assets/clinic/blender-candidates/anatomy'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=WORK+'/native-ear.glb')
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
root=bpy.data.objects.new('EarAnatomy',None);scene.collection.objects.link(root)
native=next(o for o in scene.objects if o.type=='EMPTY' and o.name.startswith('NativeRabbitPinna'))
matrix=native.matrix_world.copy();native.parent=root;native.matrix_world=matrix
native['source_asset']='patient.glb';native['license']='CC0-1.0'
native['source_attribution']='Quaternius Rabbit_Bald; clinic/LICENSE-attribution.txt'
source_objects=[o for o in scene.objects if o.type=='MESH'];native_audit=[]
for o in source_objects:
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00000001)
    # The existing triangle selection has head-attachment fragments below
    # local glTF Y=.0969. Trim only this extraction base with one plane.
    plane_co=o.matrix_world.inverted()@Vector((0,0,.105))
    plane_no=(o.matrix_world.to_3x3().transposed()@Vector((0,0,1))).normalized()
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=plane_co,plane_no=plane_no,clear_inner=True,clear_outer=False)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00000001)
    boundary=[e for e in bm.edges if e.is_boundary]
    if boundary:
        # Preserve every original surface vertex. The skinned extraction has
        # nonplanar base loops, so cap them explicitly instead of flattening them.
        unused=set(boundary);filled=[]
        while unused:
            edge=unused.pop();start=edge.verts[0];current=edge.verts[1];loopverts=[start,current]
            while current!=start:
                following=next(e for e in current.link_edges if e in unused)
                unused.remove(following);current=following.other_vert(current)
                if current!=start:loopverts.append(current)
            center=bm.verts.new(sum((v.co for v in loopverts),Vector())/len(loopverts))
            for j in range(len(loopverts)):
                filled.append(bm.faces.new((loopverts[j],loopverts[(j+1)%len(loopverts)],center)))
        for layer in list(bm.loops.layers.float_color.values())+list(bm.loops.layers.color.values()):
            for face in filled:
                for loop in face.loops:loop[layer]=(.92,.94,.91,1)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    native_audit.append({'part':o.name,'extraction_base_cut_gltf_y':.105,'base_translation_gltf_y':-.125,'boundary_edges_capped':len(boundary),'non_manifold_edges':sum(not e.is_manifold for e in bm.edges)})
    bm.to_mesh(o.data);bm.free()
    o.name='Native rabbit ear | original white and pink surface';o['source_asset']='patient.glb';o['license']='CC0-1.0'
    for polygon in o.data.polygons:polygon.use_smooth=True
native.location.z-=.125

def G(p):return (p[0],-p[2],p[1])
def material(name,hexcode,rough=.64):
    rgb=[int(hexcode[i:i+2],16)/255 for i in (0,2,4)]
    rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1)
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*rgb,1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=rough
    return m
lavender=material('Canal | soft lavender','C7B7D3')
mint=material('Membrane | quiet seafoam','B1D5CF',.45)
cream=material('Studio | warm cream','F1EBDD',.85)
newparts=[]
def mesh(name,vertices,faces,mat):
    data=bpy.data.meshes.new(name+' mesh');data.from_pydata([G(v) for v in vertices],[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.parent=root;o.data.materials.append(mat)
    o['license']='CC0-1.0';newparts.append(o)
    for p in data.polygons:p.use_smooth=True
    return o

# A small connected hollow half-pipe runs sideways beneath the preserved pinna.
# All inner/outer surfaces, the open cutaway edges and annular end caps share topology.
rings=64;radial=36;inner=.062;outer=.084;positions=[]
for i in range(rings+1):
    u=i/rings
    center=Vector((-.55+.66*u,-.071+.010*math.sin(2*math.pi*u),.024-.030*math.sin(math.pi*u)))
    tangent=Vector((.66,.020*math.pi*math.cos(2*math.pi*u),-.030*math.pi*math.cos(math.pi*u))).normalized()
    up=(Vector((0,1,0))-tangent*tangent.y).normalized();depth=tangent.cross(up).normalized()
    for radius in (inner,outer):
        for j in range(radial+1):
            angle=math.pi+math.pi*j/radial
            p=center+up*(math.cos(angle)*radius)+depth*(math.sin(angle)*radius)
            positions.append(tuple(p))
row=2*(radial+1)
def ix(i,wall,j):return i*row+wall*(radial+1)+j
faces=[]
for i in range(rings):
    for j in range(radial):
        faces.append((ix(i,0,j),ix(i+1,0,j),ix(i+1,0,j+1),ix(i,0,j+1)))
        faces.append((ix(i,1,j+1),ix(i+1,1,j+1),ix(i+1,1,j),ix(i,1,j)))
    for j in (0,radial):faces.append((ix(i,0,j),ix(i,1,j),ix(i+1,1,j),ix(i+1,0,j)))
for i in (0,rings):
    for j in range(radial):faces.append((ix(i,0,j),ix(i,0,j+1),ix(i,1,j+1),ix(i,1,j)))
canal=mesh('EarCanal | connected thick horizontal cutaway',positions,faces,lavender)

# One smoothly curved closed membrane, front-facing enough to inspect in a cutaway.
n=72;levels=8;vertices=[]
for side in (0,1):
    for ring in range(levels+1):
        radius=max(.0002,ring/levels)
        for j in range(n):
            angle=j*2*math.pi/n
            x=.105*radius*math.cos(angle);y=.120*radius*math.sin(angle)
            z=.082+.030*(1-radius*radius)+(side-.5)*.017
            # Tilt softly around the vertical axis, keeping a visible seafoam surface.
            px=.145+x*math.cos(.38)+z*math.sin(.38)*.1
            vertices.append((px,-.071+y,z-x*math.sin(.38)))
faces=[];sidecount=(levels+1)*n
for side in (0,1):
    for ring in range(levels):
        for j in range(n):
            a=side*sidecount+ring*n+j;b=side*sidecount+ring*n+(j+1)%n
            c=side*sidecount+(ring+1)*n+(j+1)%n;d=side*sidecount+(ring+1)*n+j
            faces.append((a,b,c,d))
    faces.append(tuple(side*sidecount+j for j in range(n)))
for j in range(n):faces.append((levels*n+j,levels*n+(j+1)%n,sidecount+levels*n+(j+1)%n,sidecount+levels*n+j))
drum=mesh('Eardrum | curved symbolic membrane',vertices,faces,mint)
anchors={'entrance':[-.55,-.071,.024],'toolHome':[-1.03,-.29,.024],'canal':[-.26,-.071,-.060],'eardrum':[.149,-.071,.115]}
for name,point in anchors.items():
    o=bpy.data.objects.new('Anchor_'+name,None);scene.collection.objects.link(o);o.parent=root;o.location=G(point)
    o['anchor_id']=name;o['point_gltf']=point
root['case_id']='ear';root['license']='CC0-1.0';root['source']='Native patient pinna + original symbolic canal/eardrum'
root['symbolic_anatomy']=True;root['front_axis_gltf']=[0.0,0.0,1.0]
root['recommended_scene_scale']=.18
bpy.context.view_layer.update();depsgraph=bpy.context.evaluated_depsgraph_get();audits=[];bounds=[]
for o in source_objects+newparts:
    e=o.evaluated_get(depsgraph);data=e.to_mesh();bm=bmesh.new();bm.from_mesh(data)
    remaining=set(bm.verts);components=0
    while remaining:
        components+=1;stack=[remaining.pop()]
        while stack:
            v=stack.pop()
            for edge in v.link_edges:
                other=edge.other_vert(v)
                if other in remaining:remaining.remove(other);stack.append(other)
    nonmanifold=sum(not edge.is_manifold for edge in bm.edges)
    assert nonmanifold==0,(o.name,nonmanifold)
    assert components==1,(o.name,components)
    audits.append({'part':o.name,'connected_components':components,'non_manifold_edges':nonmanifold,'vertices':len(data.vertices)})
    for vertex in data.vertices:
        p=e.matrix_world@vertex.co;bounds.append((p.x,p.z,-p.y))
    bm.free();e.to_mesh_clear()
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=PUBLIC+'/ear.glb',export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)

# Rendering is a separate short MCP call, after the geometry phase.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.195));floor=bpy.context.object;floor.name='Studio floor';floor.data.materials.append(cream)
bpy.ops.object.camera_add(location=G((2.55,1.85,5.1)));camera=bpy.context.object;camera.name='Ear review camera'
target=Vector(G((-.30,.45,.03)));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.02;scene.camera=camera
for name,point,energy,size in [('Key',(-2.5,4,4),250,4),('Fill',(3,2,4),160,4),('Rim',(0,3,-3),220,3)]:
    bpy.ops.object.light_add(type='AREA',location=G(point));light=bpy.context.object;light.name=name;light.data.energy=energy;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.75,.80,.75,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.35
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=PUBLIC+'/ear.png'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
bpy.ops.wm.save_as_mainfile(filepath=WORK+'/ear.blend')
print('EAR_PROOF='+json.dumps({'case_id':'ear','anchors':anchors,'native_ear_audit':native_audit,'parts':audits,'bounds_gltf':[min(v[a] for v in bounds) for a in range(3)]+[max(v[a] for v in bounds) for a in range(3)],'render_performed':False,'external_generation_calls':0}))
