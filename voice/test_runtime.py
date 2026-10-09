import unittest
from runtime import AudioCache

class AudioCacheTests(unittest.TestCase):
    def test_whole_audio_reused_and_metadata_not_mutated(self):
        cache=AudioCache();key=cache.key('안녕!', 'F2');info={'generation_seconds':3.2}
        cache.put(key,b'RIFF-test',info);audio,copy=cache.get(key)
        copy['generation_seconds']=0
        self.assertEqual(audio,b'RIFF-test')
        self.assertEqual(cache.get(key)[1]['generation_seconds'],3.2)
        self.assertIsInstance(next(iter(cache.entries)),bytes)
        self.assertNotIn('안녕',str(cache.entries.keys()))

    def test_voice_and_exact_text_are_separate(self):
        self.assertNotEqual(AudioCache.key('안녕!', 'F2'),AudioCache.key('안녕!', 'F1'))
        self.assertNotEqual(AudioCache.key('안녕!', 'F2'),AudioCache.key('안녕?', 'F2'))
        self.assertNotEqual(AudioCache.key('안녕!', 'F2',10),AudioCache.key('안녕!', 'F2',6))

    def test_ttl_expires_without_disk(self):
        now=[0];cache=AudioCache(ttl=5,now=lambda:now[0]);key=cache.key('안녕', 'F2')
        cache.put(key,b'abc',{});now[0]=5
        self.assertIsNone(cache.get(key));self.assertEqual(cache.bytes,0)

    def test_byte_and_entry_limits_evict_least_recently_used(self):
        cache=AudioCache(max_bytes=6,max_entries=2)
        for key in [b'a',b'b']:cache.put(key,b'123',{})
        cache.get(b'a');cache.put(b'c',b'456',{})
        self.assertIsNone(cache.get(b'b'));self.assertIsNotNone(cache.get(b'a'));self.assertEqual(cache.bytes,6)
        cache.put(b'large',b'1234567',{})
        self.assertNotIn(b'large',cache.entries);self.assertEqual(len(cache.entries),2)

if __name__=='__main__':unittest.main()
