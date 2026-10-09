/** Local static clips cover fixed captions and exact matching short replies. */
export class NarrationCache {
  constructor({ manifestURL = '/assets/voice/narration.json', warmAudio = true } = {}) {
    this.manifestURL = manifestURL;
    this.warmAudio = warmAudio;
    this.clips = new Map();
    this.warmedBlobs = new Map();
    this._loading = null;
  }

  lookup(text) {
    return this.clips.get(String(text ?? '').trim()) ?? null;
  }

  /** A ready Blob avoids a network/cache lookup at the exact caption boundary. */
  prepare(text) {
    const url = this.lookup(text);
    return url ? this.warmedBlobs.get(url) ?? null : null;
  }

  preload() {
    if (this._loading) return this._loading;
    // Missing optional static audio must not disable live TTS or the game.
    const loading = this._load().catch(() => false).then(ready => {
      if (!ready && this._loading === loading) this._loading = null;
      return ready;
    });
    this._loading = loading;
    return loading;
  }

  async _load() {
    const response = await fetch(this.manifestURL, { cache: 'no-cache' });
    if (!response.ok) return false;
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    for (const [text, url] of Object.entries(data)) {
      if (typeof url !== 'string' || !/^\/assets\/voice\/[a-z0-9-]+\.wav$/.test(url)) continue;
      this.clips.set(text.trim(), url);
    }
    if (this.warmAudio) {
      const pending = [...new Set(this.clips.values())];
      await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
        while (pending.length) {
          const url = pending.shift();
          try {
            const clip = await fetch(url, { cache: 'force-cache' });
            if (clip.ok) {
              const blob = await clip.blob();
              if (blob.size > 44) this.warmedBlobs.set(url, blob);
            }
          } catch { /* Playback can fetch the URL later or use the live fallback. */ }
        }
      }));
    }
    return this.clips.size > 0;
  }
}

export default NarrationCache;
