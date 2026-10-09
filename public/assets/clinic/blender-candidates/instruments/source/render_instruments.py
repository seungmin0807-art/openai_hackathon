"""Original MIT rendering utility; no external generation."""
import bpy
import bmesh
import json
scene=bpy.context.scene
audit=[]
depsgraph=bpy.context.evaluated_depsgraph_get()
for name in ['Tray | continuous rolled steel shell','Otoscope | connected ribbed grip',
             'Otoscope | hollow speculum','Thermometer | continuous waist and probe',
             'Penlight | continuous ivory barrel','Penlight | bent spring pocket clip']:
    o=bpy.data.objects[name]
    bm=bmesh.new();bm.from_object(o,depsgraph)
    pending=set(bm.verts);components=0
    while pending:
        components+=1;stack=[pending.pop()]
        while stack:
            for edge in stack.pop().link_edges:
                for vertex in edge.verts:
                    if vertex in pending:pending.remove(vertex);stack.append(vertex)
    audit.append({'mesh':name,'connected_components':components,'vertices':len(bm.verts),
        'faces':len(bm.faces),'non_manifold_edges':sum(not e.is_manifold for e in bm.edges)})
    bm.free()
assert all(a['connected_components']==1 and a['non_manifold_edges']==0 for a in audit)
scene['instrument_topology_audit']=json.dumps(audit)
print(json.dumps({'phase':'instrument-topology-verified','audit':audit}))
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=8
scene.render.resolution_x=900;scene.render.resolution_y=740;scene.render.resolution_percentage=100
scene.render.filepath='C:/dev/openai_hackathon/artifacts/blender-mcp/instruments/render.png'
bpy.ops.wm.save_as_mainfile(filepath='C:/dev/openai_hackathon/artifacts/blender-mcp/instruments/instruments.blend')
bpy.ops.render.render(write_still=True)
print(json.dumps({'phase':'instruments-render-complete','samples':20,'size':[900,740],'path':scene.render.filepath,
    'contact_audit':json.loads(scene['tool_contact_audit']),'topology_audit':audit}))
