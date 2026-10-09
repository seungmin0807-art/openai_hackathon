"""Download only the pinned CPU ONNX assets and bundled preset voices (~402 MB)."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import urllib.request

ROOT = Path(__file__).resolve().parent
REPO = 'supertone-oss-archive/supertonic-3'
REVISION = 'aafc6e32416a594460b32413efc49d7fe4ce6d46'

def main():
    listing_url = f'https://huggingface.co/api/models/{REPO}/tree/{REVISION}?recursive=true'
    with urllib.request.urlopen(listing_url, timeout=60) as response:
        listing = json.load(response)
    entries = [entry for entry in listing if entry['type'] == 'file' and (
        entry['path'].startswith(('onnx/', 'voice_styles/')) or entry['path'] in ('LICENSE', 'README.md'))]
    total = sum(entry['size'] for entry in entries)
    if total > 1_000_000_000:
        raise RuntimeError('Model download exceeds the 1 GB task budget')
    print(f'Pinned model download: {total / 1e6:.1f} MB', flush=True)
    def fetch(entry):
        name = entry['path']
        destination = ROOT / 'models' / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        expected = entry.get('lfs', {}).get('oid')
        def valid():
            if not destination.exists() or destination.stat().st_size != entry['size']:
                return False
            if not expected:
                return True
            with destination.open('rb') as source:
                return hashlib.file_digest(source, 'sha256').hexdigest() == expected
        if valid():
            print(f'Already verified: {name}', flush=True)
            return
        temporary = destination.with_suffix(destination.suffix + '.part')
        url = f'https://huggingface.co/{REPO}/resolve/{REVISION}/{name}?download=true'
        with urllib.request.urlopen(url, timeout=180) as response, temporary.open('wb') as output:
            while block := response.read(1024 * 1024):
                output.write(block)
        temporary.replace(destination)
        if not valid():
            raise RuntimeError(f'Model verification failed: {name}')
        print(f'Verified: {name} ({entry["size"] / 1e6:.1f} MB)', flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(fetch, entries))
    (ROOT / 'models' / 'download-manifest.json').write_text(json.dumps({
        'repo': REPO, 'revision': REVISION, 'bytes': total, 'files': entries
    }, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
