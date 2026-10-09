BLENDER CLINIC FURNITURE AND GAME INTEGRATION

The actual game at http://127.0.0.1:3000/ now uses 17 furniture placements:
preparation storage, examination bed, stool, visitor chair, privacy screen,
patient chair, storage cabinet, monitor, instrument workbench, sink workcounter,
two diagnostic holders, trolley, window/curtains, wall poster, plant and pedal bin.
The review page defaults to the complete room and offers individual asset views.
The original patient.glb and doctor.glb are preserved. Existing medical-tool
geometry, pick targets, doctor animations and examination logic are retained.
Decorative duplicate tools are omitted from the preparation cabinet in the game.

Production modules: public/clinic-furniture.js and clinic-furniture-layout.js.
Patient seat and active tool support heights are preserved at .82, .975, 1.415
and 1.433 world units. Holders support the actual tool positions. The new room
has 94 furniture meshes, batched by material, plus simple walls and floor.
Every rebuilt room owns its geometry/materials; prototypes remain cached.
Asset loading failure retains the existing primitive room fallback. The current
game uses 6 or more tool choices; smaller legacy layouts retain their room builder.

Rebuild the small Three.js geometry-merge bundle:
  node tools/build-furniture-vendor.mjs
Verify the production room, support surfaces and real tool raycast visibility:
  node tools/verify-clinic-furniture.mjs
Results: room-integration-validation.json and browser-validation.json.
Package-specific dimensions/manifold proofs, MCP calls and Cycles renders:
  exam-furniture/     bed, stool, visitor chair, privacy screen
  room-furniture/     patient chair, storage, monitor, holders, two workcounters
  room-architecture/  window/curtains, decorative wall poster, plant
All 21 public GLBs are original local Blender geometry. Prior standalone equipment
candidates remain available. Editable .blend scenes stay in Gitignored artifacts/.
The public package has no Blender application, DLL, installer, archive or .blend.

Application and dependencies are outside the Git repository:
Blender: C:\Users\uudra\AppData\Local\Programs\Blender Foundation\blender-4.5.14-windows-x64
MCP Python: C:\Users\uudra\AppData\Local\MoriBlenderMCP\.venv\Scripts\python.exe
Reviewed source and downloaded archive: C:\Users\uudra\AppData\Local\MoriBlenderMCP

Codex user config was backed up, then only the blender MCP entry was added.
Existing settings and keys were not printed or modified.
Independent local MCP client initialize, tools/list, scene inspection, code
execution, render and GLB export succeeded. The native Codex tool catalog is now
visible; one native status request reported a missing blender_mcp.config module.
Independent verified local MCP calls were used for these assets.

All communication: MCP stdio -> reviewed server -> 127.0.0.1:9876 Blender addon.
Telemetry, addon update checks and external asset/generation integrations disabled.
Codex enabled tool list permits only local inspection/code/render/screenshot tools.
No API key or paid generation service is used.

Reproduce from C:\dev\openai_hackathon:
1. Run MCP Python with artifacts/blender-mcp/mcp_client.py --script artifacts/blender-mcp/build_clinic_station.py --evidence mcp-build-render-first.json
2. Run MCP Python with artifacts/blender-mcp/mcp_client.py --script artifacts/blender-mcp/export_and_detail.py --evidence mcp-export-render.json
3. Run MCP Python with artifacts/blender-mcp/mcp_client.py --script artifacts/blender-mcp/render_detail.py --evidence mcp-detail-render.json
4. Run refine_stethoscope.py and refine_cabinet.py in separate MCP calls.
5. Build the chair using build_clinic_chair.py with clinic-station.blend loaded;
   load clinic-chair-scene.blend for refine_clinic_chair.py/render_clinic_chair.py.
6. Follow trolley/README.txt and instruments/README.md for independent port builds.
7. node artifacts/blender-mcp/verify_glb.mjs

The client automatically launches/reuses hidden GUI Blender, preserving its normal
main-thread event loop. Background mode is not patched. Every render is a real
Blender Cycles CPU render. Exported meshes evaluate bevel/weighted normals/curve
surfaces while retaining editable source curves/modifiers in the .blend file.
Tray and sink each validate as one connected closed manifold mesh after Solidify.

Editable source: artifacts/blender-mcp/clinic-station.blend (Git-ignored).
Game-ready candidates and small source scripts: public/assets/clinic/blender-candidates/
Viewer: http://127.0.0.1:3000/assets/clinic/blender-candidates/review.html
Existing patient.glb and doctor.glb are unchanged. The ToolSelector source now
loads the integrated room described above; gameplay uses its existing tools.
The standalone station has 89 meshes and 65,232 triangles; game clones are batched
by material and omit decorative duplicates.

Parallel creation uses independent Blender GUI processes, ports 9877/9878/9879 and
per-port preference directories. The same computer's CPU/GPU are shared, so
render jobs are coordinated separately from modelling.
The launcher also uses a global per-port Windows startup lock. Two simultaneous
MCP clients initialized and inspected the same scene with one Blender process;
source/startup-lock-validation.json records the concurrency check. It prevents
multiple Codex chats from opening duplicate default-port Blender GUIs.

The user selected the original friendly rabbit and doctor. New character
experiments are archived under artifacts/blender-mcp/character-candidates/
and excluded from the public preview and Git. Only furniture and equipment
are exposed by the review page. Existing character models are unchanged.

The original eight candidates include the station, chair, stethoscope, trolley and an
instrument tray with separate otoscope, thermometer and penlight exports.
All eight GLBs load with the game's Three.js 186 GLTFLoader and finite
geometry. The chair and trolley sit on y=0; instrument set contact checks
and connected manifold checks are included in each package's proof.
