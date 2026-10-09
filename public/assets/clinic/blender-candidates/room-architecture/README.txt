Clinic room architecture assets

window-curtains.glb: A complete four-pane frosted window with a honey oak sill, rounded frame and latch, continuous satin rail, fixing brackets and hanging rings, plus two continuous pleated peach cloth curtains. Bottom-center origin, +Z front in glTF, size 4.6 x 2.95 x 0.375 meters. Six material batches.

eye-chart.glb: A shallow warm paper poster in a cream/oak frame, with dark forest E-shaped rows and a sage header. Decorative only. Bottom-center origin, +Z front in glTF, size 1.15 x 0.701 x 0.091 meters. Five material batches.

plant.glb: A hollow peach ceramic pot with soil, five continuous curved stems and five broad continuous leaves. Bottom-center origin, size 0.729 x 1.302 x 0.661 meters. Four material batches.

All assets are original local Blender 4.5.14 LTS geometry generated through actual local MCP initialize, tools/list and execute_blender_code calls on loopback port 9879. No downloaded geometry or external AI generation calls were used.

The editable source is kept in artifacts/blender-mcp/room-architecture/architecture.blend, excluded from Git. Blender and the MCP runtime are installed under the user's AppData, outside the repository.

build_architecture.py retains each editable manufacturing part and batches evaluated export copies by material for game rendering. mcp-build.json contains successful MCP evidence and the connected-surface/non-manifold-edge checks. verify_glb.mjs checks loading with the project's actual Three.js 186 GLTFLoader, finite positions, dimensions, origin and embedded license/asset metadata. glb-validation.json records the result.

Original geometry: CC0-1.0. Original scripts: MIT. See LICENSE.txt.
