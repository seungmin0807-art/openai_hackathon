Original Local Blender Clinic Trolley Candidate

trolley.glb: self-contained, static equipment asset. Units metres; glTF Y
up, front +Z. Four caster tires contact y=0. Blender source is Z-up, front -Y.
render.png: actual local Cycles render at 900x1000, 20 samples, denoised.
build_trolley.py and render_trolley.py: reproducible original source.
LICENSE.txt: original assets CC0-1.0; source MIT.

The editable compressed .blend remains at
artifacts/blender-mcp/trolley/trolley.blend, outside Git.
Blender itself and the Python MCP environment are outside the repository.

Reproduction from this checkout, sequential calls on the same local port:
python artifacts/blender-mcp/mcp_client.py --port 9877 --work-dir
artifacts/blender-mcp/trolley --scene artifacts/blender-mcp/trolley/trolley.blend
--script public/assets/clinic/blender-candidates/trolley/build_trolley.py
--evidence mcp-model-export.json
Then call render_trolley.py with the same arguments and mcp-render.json.
Scripts contain absolute OUT/PUBLIC paths for this Windows checkout; adjust
both paths before using another project directory.

Verification: node artifacts/blender-mcp/trolley/verify_trolley.mjs uses
the game's actual Three.js GLTFLoader; checks finite geometry, scale, four
caster tires and their ground contact. Blender mesh audits separately check
the connected formed tray/shelf shells and continuous moulded tires.

This is a static review candidate. Caster/drawer mechanics are modelled but
not interactive or simulated. Original game source and patient/doctor
assets are unchanged. No remote media generation service was used.
