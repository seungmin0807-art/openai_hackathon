"""Original syringe (solid plunger, no spring) and wooden tongue depressor.
Geometry CC0-1.0; production script MIT. Local Blender MCP only; no render/API.
"""
import bpy, bmesh, math, json
from mathutils import Vector

WORK='C:/dev/openai_hackathon/artifacts/blender-mcp/additional-instruments'
PUBLIC='C:/dev/openai_hackathon/public/assets/clinic/blender-candidates/instruments'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
parts=[]

def material(name,hexcode,rough=.4,metal=0,alpha=1):
    rgb=[int(hexcode[i:i+2],16)/255 for i in (0,2,4)]
    rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,alpha);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    p.inputs['Alpha'].default_value=alpha
    if alpha<1:
        m.surface_render_method='DITHERED'
        p.inputs['Transmission Weight'].default_value=.18
        p.inputs['IOR'].default_value=1.46
    return m

cream=material('Polymer | warm medical ivory','EFEDE0',.4)
mint=material('Polymer | eucalyptus','75A995',.42)
dark=material('Elastomer | deep green','254B40',.62)
barrelmat=material('Barrel | frosted warm polymer','E3E9DF',.24,0,.38)
steel=material('Steel | satin brushed','CED8D5',.27,.93)
wood=material('Wood | warm birch','D9B88A',.70)
grain=material('Wood | quiet natural grain','CBA875',.76)

def root(name,tool_id,contact):
    r=bpy.data.objects.new(name,None);scene.collection.objects.link(r)
    r['tool_id']=tool_id;r['selectable_tool']=tool_id;r['license']='CC0-1.0'
    r['source']='Original local Blender Python geometry'
    r['long_axis_gltf']=[0.0,1.0,0.0]
    r['front_axis_gltf']=[0.0,0.0,1.0]
    r['grip_point_gltf']=[0.0,0.0,0.0]
    r['contact_point_gltf']=contact
    r['unit']='meter';r['pickup_origin']='Grip center; glTF +Y towards working end'
    return r

def mesh(name,verts,faces,mat,parent,bevel=0):
    data=bpy.data.meshes.new(name+' mesh');data.from_pydata(verts,[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.parent=parent
    o.data.materials.append(mat);o['license']='CC0-1.0';parts.append(o)
    for p in o.data.polygons:p.use_smooth=True
    if bevel:
        modifier=o.modifiers.new('Soft manufactured edges','BEVEL');modifier.width=bevel;modifier.segments=4
        o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL')
    return o

def lathe(name,rows,mat,parent,n=48,loop=False):
    verts=[(radius*math.cos(i*2*math.pi/n),radius*math.sin(i*2*math.pi/n),z) for z,radius in rows for i in range(n)]
    faces=[]
    pairs=len(rows) if loop else len(rows)-1
    for j in range(pairs):
        k=(j+1)%len(rows)
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,k*n+(i+1)%n,k*n+i))
    if not loop:
        faces.append(tuple(reversed(range(n))));faces.append(tuple((len(rows)-1)*n+i for i in range(n)))
    return mesh(name,verts,faces,mat,parent)

def rounded_box(name,loc,size,mat,parent,bevel=.001):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.parent=parent;o.data.materials.append(mat);o['license']='CC0-1.0';parts.append(o)
    mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=4
    for p in o.data.polygons:p.use_smooth=True
    o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL')
    return o

syringe=root('SyringePickup','syringe',[0.0,.122,0.0])
syringe['spring_present']=False
syringe['structure']='Hollow polymer barrel, solid plunger shaft, piston, finger flanges, thumb pad and short steel tip'
# One connected, closed hollow barrel wall. The center remains open for the shaft.
lathe('Syringe | connected hollow barrel',[
    (-.057,.0118),(-.055,.013),(.049,.013),(.055,.012),(.059,.0098),
    (.059,.0080),(.053,.0108),(-.055,.0108),(-.057,.0100)],barrelmat,syringe,64,True)
lathe('Syringe | rear barrel lip',[
    (-.059,.012),(-.058,.0137),(-.054,.0137),(-.053,.0127),
    (-.053,.0108),(-.054,.0108),(-.058,.0100),(-.059,.0100)],cream,syringe,48,True)
# Molded flange wings are separate solid manufactured components, connected to the lip.
for side in (-1,1):
    rounded_box('Syringe | finger flange '+str(side),(side*.018,0,-.056),(.018,.018,.0045),cream,syringe,.0016)
lathe('Syringe | solid plunger shaft',[(-.096,.0028),(-.094,.004),(-.018,.004),(-.014,.0038)],mint,syringe)
lathe('Syringe | fitted piston',[(-.020,.0096),(-.018,.0106),(-.010,.0106),(-.008,.0094)],dark,syringe)
lathe('Syringe | rounded thumb pad',[(-.103,.015),(-.102,.019),(-.098,.020),(-.095,.018)],mint,syringe)
lathe('Syringe | tapered nozzle',[(.052,.0105),(.057,.0098),(.068,.0063),(.071,.0052)],cream,syringe)
lathe('Syringe | mint tip hub',[(.067,.0056),(.071,.0067),(.080,.0062),(.084,.0036)],mint,syringe)
lathe('Syringe | short rounded steel tip',[(.082,.0010),(.120,.0010),(.1215,.0008),(.122,.00025)],steel,syringe,32)
# Symbolic graduations without dosage labels or fabricated numeric readings.
for i in range(11):
    z=-.040+i*.0072;length=.006 if i%5==0 else .0038
    rounded_box('Syringe | neutral graduation %02d'%i,(.001,-.0131,z),(length,.00045,.00062),dark,syringe,.00012)

spatula=root('SpatulaPickup','spatula',[0.0,.110,0.0])
spatula['structure']='One continuous rounded birch tongue depressor with a soft bevel and physical thickness'
spatula['dimensions_m']=[.024,.150,.0035]
# Capsule perimeter in XZ: bottom -0.040, working end +0.110, lower-third grip at zero.
radius=.012;halfstraight=.063;center=.035;n=32
outline=[]
for centerz,start in ((center+halfstraight,0),(center-halfstraight,math.pi)):
    for i in range(n):
        angle=start+math.pi*i/n
        outline.append((radius*math.cos(angle),centerz+radius*math.sin(angle)))
verts=[(x,y,z) for y in (-.00175,.00175) for x,z in outline]
count=len(outline)
faces=[tuple(reversed(range(count))),tuple(count+i for i in range(count))]
for i in range(count):faces.append((i,(i+1)%count,count+(i+1)%count,count+i))
body=mesh('Spatula | continuous rounded wooden body',verts,faces,wood,spatula,.0006)
# Sparse, shallow closed grain strands; no downloaded or generated texture.
for i,x in enumerate((-.0055,-.001,.0038)):
    strand=rounded_box('Spatula | quiet grain '+str(i),(x,-.00176,.030+i*.008),(.00010,.00010,.090-i*.007),grain,spatula,.00004)
    strand.rotation_euler.y=(i-1)*.006

bpy.context.view_layer.update()
depsgraph=bpy.context.evaluated_depsgraph_get();audits=[];exports=[]
for r in (syringe,spatula):
    localverts=[]
    for o in r.children:
        e=o.evaluated_get(depsgraph);data=e.to_mesh();bm=bmesh.new();bm.from_mesh(data)
        nonmanifold=sum(not edge.is_manifold for edge in bm.edges)
        remaining=set(bm.verts);components=0
        while remaining:
            components+=1;stack=[remaining.pop()]
            while stack:
                v=stack.pop()
                for edge in v.link_edges:
                    other=edge.other_vert(v)
                    if other in remaining:remaining.remove(other);stack.append(other)
        bm.free()
        assert nonmanifold==0,(o.name,nonmanifold)
        assert components==1,(o.name,components)
        # Original Blender +Z maps to glTF +Y, and Blender -Y maps to glTF +Z.
        transform=r.matrix_world.inverted()@e.matrix_world
        for v in data.vertices:
            p=transform@v.co;localverts.append((p.x,p.z,-p.y))
        audits.append({'tool_id':r['tool_id'],'part':o.name,'vertices':len(data.vertices),'connected_components':components,'non_manifold_edges':nonmanifold})
        e.to_mesh_clear()
    bounds=[min(v[a] for v in localverts) for a in range(3)]+[max(v[a] for v in localverts) for a in range(3)]
    r['bounds_gltf_m']=bounds
    bpy.ops.object.select_all(action='DESELECT');r.select_set(True)
    for o in r.children:o.select_set(True)
    outfile=PUBLIC+'/'+r['tool_id']+'.glb'
    bpy.ops.export_scene.gltf(filepath=outfile,export_format='GLB',use_selection=True,export_apply=True,
        export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    exports.append({'tool_id':r['tool_id'],'file':outfile,'bounds_gltf_m':bounds,
        'grip_point_gltf':list(r['grip_point_gltf']),'contact_point_gltf':list(r['contact_point_gltf']),
        'parts':len(r.children),'spring_present':False if r==syringe else None})

proof={'blender_version':bpy.app.version_string,'license_geometry':'CC0-1.0','license_script':'MIT',
    'external_generation_calls':0,'render_performed':False,'exports':exports,'parts_audit':audits}
# Preserve editable manufactured parts in a separate Gitignored working scene.
syringe.location.x=-.040;spatula.location.x=.040
bpy.ops.wm.save_as_mainfile(filepath=WORK+'/additional-instruments.blend')
print('ADDITIONAL_INSTRUMENTS_PROOF='+json.dumps(proof))
