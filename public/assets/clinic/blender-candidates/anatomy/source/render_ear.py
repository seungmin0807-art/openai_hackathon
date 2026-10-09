import bpy, json
assert bpy.data.objects.get('EarAnatomy') and bpy.data.objects['EarAnatomy'].get('case_id')=='ear', 'Load the saved ear.blend scene first'
bpy.data.objects['Studio floor'].location.z=-.195
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
bpy.ops.render.render(write_still=True)
scene=bpy.context.scene
print('EAR_RENDER='+json.dumps({'case_id':'ear','render_performed':True,'engine':scene.render.engine,'device':scene.cycles.device,'samples':scene.cycles.samples,'threads':scene.render.threads,'resolution':[scene.render.resolution_x,scene.render.resolution_y],'png':scene.render.filepath}))
