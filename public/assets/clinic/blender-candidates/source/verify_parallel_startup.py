"""Integration check: two concurrent MCP clients must share one Blender startup."""
import json
import subprocess
import sys
from pathlib import Path

root=Path(__file__).resolve().parent
work=root/'startup-check'
work.mkdir(exist_ok=True)
assert not (work/'runtime/blender.log').exists(), 'Use a fresh evidence directory'
commands=[[
    sys.executable,str(root/'mcp_client.py'),'--port','9879','--work-dir',str(work),
    '--scene',str(root/'clinic-station.blend'),'--evidence',f'client-{index}.json'
] for index in (1,2)]
clients=[subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8') for command in commands]
for client in clients:
    output,_=client.communicate(timeout=120)
    assert client.returncode==0,output
evidence=[json.loads((work/f'client-{index}.json').read_text(encoding='utf-8')) for index in (1,2)]
assert all(not item['call'].get('isError') for item in evidence)
log=(work/'runtime/blender.log').read_text(encoding='utf-8',errors='replace')
starts=log.count('CLINIC_BLENDER_READY')
assert starts==1,f'Expected one Blender startup, saw {starts}'
proof={'concurrent_clients':2,'successful_mcp_initializations':2,'successful_scene_calls':2,'blender_startups':starts,'port':9879,'blender_pid':int((work/'runtime/blender-pid.txt').read_text())}
(root/'startup-lock-validation.json').write_text(json.dumps(proof,indent=2),encoding='utf-8')
print(json.dumps(proof))
