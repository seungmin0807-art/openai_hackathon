"""Local preset/quality listening samples, one model instance, no external calls."""
from io import BytesIO
import json
from pathlib import Path
import time
import numpy as np
import soundfile as sf
from runtime import TunedTTS

ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent/'artifacts'/'audio'
TEXT='좋아! 토리의 몸에서 나는 소리를 함께 들어보자.'
def pitch_summary(wave,sample_rate):
    # Descriptive only: acoustic pitch is not a subjective naturalness score.
    signal=wave[::4];rate=sample_rate/4;frame_size=int(rate*.035);hop=int(rate*.025)
    pitches=[]
    for start in range(0,len(signal)-frame_size,hop):
        frame=signal[start:start+frame_size];frame=frame-np.mean(frame)
        if np.sqrt(np.mean(frame**2))<.012:continue
        frame=frame*np.hanning(len(frame));corr=np.correlate(frame,frame,'full')[len(frame)-1:]
        lo,hi=int(rate/500),min(len(corr),int(rate/110));lag=lo+int(np.argmax(corr[lo:hi]))
        if corr[0] and corr[lag]/corr[0]>.55:pitches.append(rate/lag)
    return {'medianHz':round(float(np.median(pitches)),1),'voicedFrames':len(pitches)} if pitches else {'medianHz':None,'voicedFrames':0}
def main():
    OUT.mkdir(exist_ok=True,parents=True);started=time.perf_counter();tts=TunedTTS(ROOT/'models',threads=4,spinning=False)
    report={'engine':'supertonic-3','text':TEXT,'speed':1.05,'threads':4,'spinning':False,'initializationSeconds':round(time.perf_counter()-started,3),'samples':[],'subjectiveListeningRequired':True}
    cases=[(f'F{index}',10) for index in range(1,6)]+[('F2',6),('F2',5)]
    for voice,steps in cases:
        start=time.perf_counter();wave,_=tts.synthesize(TEXT,voice_style=tts.get_voice_style(voice),lang='ko',total_steps=steps,speed=1.05,max_chunk_length=100,silence_duration=.32,verbose=False)
        wave=np.asarray(wave,dtype=np.float32).reshape(-1);fade=min(int(tts.sample_rate*.012),len(wave)//2)
        wave[:fade]*=np.linspace(0,1,fade);wave[-fade:]*=np.linspace(1,0,fade)
        path=OUT/f'voice-audition-{voice}-{steps}steps.wav';sf.write(path,wave,tts.sample_rate,subtype='PCM_16')
        sample={'voice':voice,'steps':steps,'generationSeconds':round(time.perf_counter()-start,3),'audioSeconds':round(len(wave)/tts.sample_rate,3),'rms':round(float(np.sqrt(np.mean(wave**2))),6),'peak':round(float(np.max(np.abs(wave))),6),'sampleRate':tts.sample_rate,'pitch':pitch_summary(wave,tts.sample_rate),'path':str(path.relative_to(ROOT.parent)).replace('\\','/')}
        report['samples'].append(sample);(OUT/'voice-audition.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(sample,ensure_ascii=True),flush=True)
if __name__=='__main__':main()
