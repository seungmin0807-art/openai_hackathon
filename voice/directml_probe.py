"""Isolated provider/one-small-model feasibility only; production ORT unchanged."""
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'dml-runtime'))
import json
import time
import numpy as np
import onnxruntime as ort
from supertonic.config import DP_ONNX_REL_PATH
from supertonic.loader import load_voice_style_from_name

report={'runtimeVersion':ort.__version__,'isolatedPackage':str(Path(ort.__file__).resolve()),'availableProviders':ort.get_available_providers(),'productionRuntimeChanged':False,'fullTTSSpeedMeasured':False,'scope':'One duration predictor load/run; not a full synthesis benchmark'}
try:
    if 'DmlExecutionProvider' not in ort.get_available_providers():raise RuntimeError('DML_PROVIDER_UNAVAILABLE')
    options=ort.SessionOptions();options.enable_mem_pattern=False;options.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL;options.intra_op_num_threads=1;options.inter_op_num_threads=1
    start=time.perf_counter();session=ort.InferenceSession(ROOT/'models'/DP_ONNX_REL_PATH,sess_options=options,providers=['DmlExecutionProvider','CPUExecutionProvider']);report['loadSeconds']=round(time.perf_counter()-start,3);report['activeProviders']=session.get_providers()
    style=load_voice_style_from_name(ROOT/'models','F4');values={'text_ids':np.array([[1,2,3,4]],dtype=np.int64),'text_mask':np.ones((1,1,4),dtype=np.float32),'style_dp':style.dp}
    start=time.perf_counter();result=session.run(None,values);report['oneRunSeconds']=round(time.perf_counter()-start,3);report['finiteOutputs']=all(np.isfinite(value).all() for value in result);report['success']=True
except Exception as error:
    # Exclude arbitrary DLL paths and error bodies; preserve useful structured cause.
    report['success']=False;report['errorType']=type(error).__name__;report['errorCode']='DML_PROVIDER_UNAVAILABLE' if str(error)=='DML_PROVIDER_UNAVAILABLE' else 'DML_LOAD_OR_RUN_FAILED'
path=ROOT.parent/'artifacts'/'audio'/'directml-feasibility.json';path.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
