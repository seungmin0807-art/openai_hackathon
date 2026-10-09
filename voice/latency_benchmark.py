"""Local-only adult sentence benchmark; no credentials or remote API calls."""
import argparse
from io import BytesIO
import json
from pathlib import Path
import subprocess
import time
from urllib.request import Request, urlopen
import soundfile as sf
import numpy as np

TEXTS=['청진기로 심장 소리와 숨소리를 들어요.', '맞아! 몸에서 나는 소리를 듣고 몸 상태를 살펴보는 거야.']
def cpu_snapshot():
    script="Get-Process chrome,python -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,CPU | ConvertTo-Json -Compress"
    try:
        data=json.loads(subprocess.check_output(['powershell.exe','-NoProfile','-Command',script],text=True,timeout=8))
        return data if isinstance(data,list) else [data]
    except Exception:
        return []
def run(base,label,count):
    with urlopen(base+'/health',timeout=5) as response:
        health=json.load(response)
    results=[]
    for index,text in enumerate(TEXTS[:count]):
        before=cpu_snapshot();start=time.perf_counter()
        request=Request(base+'/tts',data=json.dumps({'text':text,'voice':'F2'}).encode(),headers={'Content-Type':'application/json'},method='POST')
        with urlopen(request,timeout=90) as response:
            audio=response.read();headers=dict(response.headers)
        elapsed=time.perf_counter()-start;after=cpu_snapshot()
        waveform,sample_rate=sf.read(BytesIO(audio),dtype='float32')
        generation=float(headers.get('X-Generation-Seconds','nan'))
        previous={p['Id']:p.get('CPU') or 0 for p in before}
        cpu_delta={name:round(sum(max(0,(p.get('CPU') or 0)-previous.get(p['Id'],p.get('CPU') or 0)) for p in after if p['ProcessName']==name),3) for name in ['chrome','python']}
        target=Path('artifacts/audio')/f'tts-{label}-{index+1}.wav';target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(audio)
        result={'label':label,'text':text,'httpSeconds':round(elapsed,3),'generationSeconds':generation,'outsideGenerationSeconds':round(elapsed-generation,3),'audioSeconds':round(len(waveform)/sample_rate,3),'rms':round(float(np.sqrt(np.mean(waveform**2))),6),'sampleRate':sample_rate,'cpuSecondsDuringRequest':cpu_delta,'path':str(target).replace('\\','/'),'headers':{k:v for k,v in headers.items() if k.startswith('X-')}}
        results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True)
    return {'label':label,'capturedAt':time.strftime('%Y-%m-%dT%H:%M:%S'),'health':health,'results':results}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:8011');parser.add_argument('--label',default='before');parser.add_argument('--count',type=int,default=2);args=parser.parse_args()
    if args.base not in ['http://127.0.0.1:8011','http://127.0.0.1:8012']:raise SystemExit('Only local benchmark ports are allowed')
    result=run(args.base,args.label,args.count);path=Path('artifacts/audio')/f'tts-{args.label}.json';path.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
