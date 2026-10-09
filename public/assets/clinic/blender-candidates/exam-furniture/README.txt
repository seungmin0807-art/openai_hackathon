Original Local Blender Clinic Furniture Candidates

Four static GLBs: exam-bed.glb, stool.glb, visitor-chair.glb,
privacy-screen.glb. Source units directly match the existing game's room.
Every exported root is at floor-centred XZ, glTF Y up and front +Z. Bed
pillow is at the back (-Z). These are game proportions, not asserted
standard clinical furniture dimensions.

Nominal dimensions and heights:
exam-bed: width 2.15, depth 3.6, mattress top .98.
stool: cushion diameter .96, cushion top .55; stable five-caster base.
visitor-chair: width 1.3, depth 1.12, seat top .69, back top 1.85.
privacy-screen: width 2.2, top 3.7; actual folded cream cloth, hanging
rail/rings, two columns and stable fore-aft caster bases.

Upholstery is a closed mesh with actual subdivision. The privacy fabric
is a connected curved quad sheet with thickness. Manufactured frames,
casters and joints use bevelled local geometry. Same-material evaluated
geometry is batched in exported GLBs to reduce draw calls; editable
original parts remain in artifacts/blender-mcp/exam-furniture/exam-furniture.blend.
The .blend stays outside Git; application installers are outside the repo.

render.png is an actual 1000x900, 20-sample local Cycles gallery render.
MIT source and CC0 assets: see LICENSE.txt.

Reproduce from this checkout with the verified sequential local MCP client:
python artifacts/blender-mcp/mcp_client.py --port 9877 --work-dir
artifacts/blender-mcp/exam-furniture --scene
artifacts/blender-mcp/exam-furniture/exam-furniture.blend --script
public/assets/clinic/blender-candidates/exam-furniture/build_exam_furniture.py
--evidence mcp-model-export.json
Then call render_exam_furniture.py, with evidence mcp-render.json.
Adjust absolute OUT/PUBLIC paths before using another checkout.

node artifacts/blender-mcp/exam-furniture/verify_exam_furniture.mjs checks
the game's actual Three.js 186 GLTFLoader, sizes, floor contact, finite
geometry, embedded resources, material batching and root metadata.
Blender audits separately inspect source upholstery, sheet and tire
connectivity and watertightness before batching.

No character, application source or existing furniture asset was modified.
