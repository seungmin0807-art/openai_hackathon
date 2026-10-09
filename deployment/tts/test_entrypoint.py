"""Offline HTTP adapter tests: fake engine, no model loading or provider calls."""
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location('cloud_voice', Path(__file__).with_name('entrypoint.py'))
cloud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cloud)
TOKEN = 'fixture-secret-only-' * 3


class FakeEngine:
    def __init__(self):
        self.default_voice='F4'
        self.calls=0
        self.entered=threading.Event()
        self.release=threading.Event()
        self.release.set()

    def synthesize(self, text, voice):
        self.calls += 1
        self.entered.set()
        self.release.wait(timeout=5)
        return b'fixture-only-not-a-real-WAV', dict(duration_seconds=1, generation_seconds=0,
            sample_rate=44100, voice=voice, queue_seconds=0, cache_hit=False)


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.engine=FakeEngine()
        self.server=ThreadingHTTPServer(('127.0.0.1',0),cloud.make_cloud_handler(self.engine,TOKEN,max_inflight=1))
        self.server.daemon_threads=True
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.url=f'http://127.0.0.1:{self.server.server_port}/tts'

    def tearDown(self):
        self.engine.release.set()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, token=None):
        headers={'Content-Type':'application/json'}
        if token is not None:headers['Authorization']='Bearer '+token
        request=Request(self.url,json.dumps({'text':'fixture'}).encode(),headers=headers)
        try:
            with urlopen(request,timeout=8) as response:return response.status,response.read(),response.headers
        except HTTPError as error:return error.code,error.read(),error.headers

    def test_auth_rejected_before_synthesis(self):
        for token in [None,'wrong-secret']:
            status,_,_=self.request(token)
            self.assertEqual(status,401)
        self.assertEqual(self.engine.calls,0)

    def test_authenticated_request_preserves_binary_contract(self):
        status,body,headers=self.request(TOKEN)
        self.assertEqual(status,200)
        self.assertEqual(body,b'fixture-only-not-a-real-WAV')
        self.assertEqual(headers['Content-Type'],'audio/wav')
        self.assertEqual(headers['X-Voice'],'F4')

    def test_overload_has_retry_header_and_does_not_queue_unbounded_work(self):
        self.engine.release.clear()
        with ThreadPoolExecutor(max_workers=1) as pool:
            first=pool.submit(self.request,TOKEN)
            self.assertTrue(self.engine.entered.wait(timeout=2))
            status,_,headers=self.request(TOKEN)
            self.assertEqual(status,503)
            self.assertEqual(headers['Retry-After'],'2')
            self.assertEqual(self.engine.calls,1)
            self.engine.release.set()
            self.assertEqual(first.result()[0],200)
        self.assertEqual(self.request(TOKEN)[0],200)


if __name__=='__main__':unittest.main()
