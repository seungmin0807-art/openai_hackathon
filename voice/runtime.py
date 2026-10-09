"""Pinned SDK-compatible local runtime options and bounded ephemeral WAV cache."""
from collections import OrderedDict
from hashlib import sha256
from pathlib import Path
import time

import onnxruntime as ort
from supertonic import TTS
from supertonic.config import (DP_ONNX_REL_PATH, TEXT_ENC_ONNX_REL_PATH,
                               VECTOR_EST_ONNX_REL_PATH, VOCODER_ONNX_REL_PATH)
from supertonic.core import Supertonic
from supertonic.loader import (load_configs, load_text_processor,
                               list_available_voice_style_names)


class TunedTTS(TTS):
    """Same SDK synthesis/weights; configure session pools without SDK patching."""
    def __init__(self, model_dir, threads=4, spinning=False):
        self.model_name = 'supertonic-3'
        self.is_multilingual = True
        self.model_dir = Path(model_dir)
        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        options.add_session_config_entry('session.intra_op.allow_spinning', '1' if spinning else '0')
        options.add_session_config_entry('session.inter_op.allow_spinning', '1' if spinning else '0')
        sessions = [ort.InferenceSession(self.model_dir / relative, sess_options=options,
                    providers=['CPUExecutionProvider']) for relative in
                    (DP_ONNX_REL_PATH, TEXT_ENC_ONNX_REL_PATH, VECTOR_EST_ONNX_REL_PATH, VOCODER_ONNX_REL_PATH)]
        self.model = Supertonic(load_configs(self.model_dir), load_text_processor(self.model_dir), *sessions)
        self.sample_rate = self.model.sample_rate
        self.voice_style_names = list_available_voice_style_names(self.model_dir)


class AudioCache:
    """Whole-utterance reuse, LRU/TTL/byte bounded, no disk or text keys."""
    def __init__(self, max_bytes=16*1024*1024, max_entries=32, ttl=300, now=time.monotonic):
        self.max_bytes, self.max_entries, self.ttl = max_bytes, max_entries, ttl
        self.now, self.entries, self.bytes = now, OrderedDict(), 0

    @staticmethod
    def key(text, voice, steps=10):
        return sha256(f'supertonic-3|ko|{steps}|1.05|100|{voice}|{text}'.encode()).digest()

    def prune(self):
        for key in [key for key, value in self.entries.items() if self.now()-value[0] >= self.ttl]:
            self.bytes -= len(self.entries.pop(key)[1])

    def get(self, key):
        self.prune()
        value = self.entries.get(key)
        if value is None:
            return None
        self.entries.move_to_end(key)
        return value[1], dict(value[2])

    def put(self, key, audio, info):
        self.prune()
        if len(audio) > self.max_bytes or self.max_entries < 1:
            return
        old = self.entries.pop(key, None)
        if old:
            self.bytes -= len(old[1])
        self.entries[key] = (self.now(), audio, dict(info))
        self.bytes += len(audio)
        while self.bytes > self.max_bytes or len(self.entries) > self.max_entries:
            _, old = self.entries.popitem(last=False)
            self.bytes -= len(old[1])
