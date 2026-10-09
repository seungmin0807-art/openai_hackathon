"""Bounded same-text, same-noise CPU 10/6/10-step comparison."""
import json
from pathlib import Path
import time
import numpy as np
import soundfile as sf
from runtime import TunedTTS

ROOT=Path(__file__).resolve().parent;OUT=ROOT.parent/'artifacts'/'audio'
TEXT='청진기로 몸에서 나는 소리를 듣는 거야.'
tts=TunedTTS(ROOT/'models',threads=4,spinning=False);style=tts.get_voice_style('F4')
report={'text':TEXT,'characters':len(TEXT),'voice':'F4','speed':1.05,'threads':4,'spinning':False,'randomSeed':20261009,'sequence':[10,6,10],'renderCoordination':'Ear agent confirmed render closed before starting','samples':[]}
for index,steps in enumerate(report['sequence'],1):
    np.random.seed(report['randomSeed']);start=time.perf_counter()
    wave,_=tts.synthesize(TEXT,voice_style=style,lang='ko',total_steps=steps,speed=1.05,max_chunk_length=100,silence_duration=.32,verbose=False)
    wave=np.asarray(wave,dtype=np.float32).reshape(-1);elapsed=time.perf_counter()-start
    fade=min(int(tts.sample_rate*.012),len(wave)//2);wave[:fade]*=np.linspace(0,1,fade);wave[-fade:]*=np.linspace(1,0,fade)
    path=OUT/f'tts-paired-F4-{steps}steps-{index}.wav';sf.write(path,wave,tts.sample_rate,subtype='PCM_16')
    sample={'steps':steps,'generationSeconds':round(elapsed,3),'audioSeconds':round(len(wave)/tts.sample_rate,3),'rms':round(float(np.sqrt(np.mean(wave**2))),6),'peak':round(float(np.max(np.abs(wave))),6),'sampleRate':tts.sample_rate,'finite':bool(np.isfinite(wave).all()),'path':str(path.relative_to(ROOT.parent)).replace('\\','/')};report['samples'].append(sample)
    if len(report['samples'])==3:
        baseline=(report['samples'][0]['generationSeconds']+report['samples'][2]['generationSeconds'])/2
        report['sixStepReductionPercent']=round((1-report['samples'][1]['generationSeconds']/baseline)*100,1)
        report['listeningRequired']=True
    (OUT/'tts-paired.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(sample),flush=True)
