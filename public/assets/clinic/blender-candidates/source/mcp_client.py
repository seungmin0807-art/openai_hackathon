"""Reproducible MCP initialize/tools/list/tools/call verifier, without an AI API."""
import argparse
import asyncio
import datetime
import json
import os
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parent

async def run(args):
    env = os.environ.copy()
    env.update({"DISABLE_TELEMETRY": "true", "PYTHONUTF8": "1"})
    workspace = Path(args.work_dir).resolve() if args.work_dir else ROOT
    workspace.mkdir(parents=True, exist_ok=True)
    env.update({'BLENDER_PORT': str(args.port), 'MORI_BLENDER_WORK_DIR': str(workspace)})
    if args.scene:
        env['MORI_BLENDER_SCENE'] = str(Path(args.scene).resolve())
    params = StdioServerParameters(command=sys.executable, args=[str(ROOT / "launch_mcp.py")], env=env)
    evidence = {"time_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write, read_timeout_seconds=datetime.timedelta(seconds=600)) as session:
            init = await session.initialize()
            evidence["initialize"] = init.model_dump(mode="json")
            listing = await session.list_tools()
            evidence["tools"] = [t.model_dump(mode="json") for t in listing.tools]
            print("MCP initialized:", init.serverInfo.name, init.serverInfo.version, flush=True)
            print("Tools:", ", ".join(t.name for t in listing.tools), flush=True)
            if args.script:
                code = Path(args.script).read_text(encoding="utf-8")
                result = await session.call_tool("execute_blender_code", {"code": code})
            else:
                result = await session.call_tool("get_scene_info", {})
            evidence["call"] = result.model_dump(mode="json")
            for item in result.content:
                if item.type == "text":
                    print(item.text, flush=True)
            output = workspace / args.evidence
            output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
            if result.isError or any("Error executing code:" in getattr(c, "text", "") or "Rejected by safe mode" in getattr(c, "text", "") for c in result.content):
                raise RuntimeError("MCP call failed; see " + str(output))

parser = argparse.ArgumentParser()
parser.add_argument("--script")
parser.add_argument("--evidence", default="mcp-handshake.json")
parser.add_argument('--port', type=int, default=9876)
parser.add_argument('--work-dir')
parser.add_argument('--scene')
asyncio.run(run(parser.parse_args()))
