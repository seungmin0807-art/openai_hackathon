import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Generates a reviewable patch; never writes root-owned app.js.
const original = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const lines = original.replace(/\r\n/g, '\n').split('\n');
const changes = [];
function propose(before, after, reason) {
  const index = lines.findIndex(line => line.includes(before));
  if (index === -1) { changes.push({reason, state: 'needs_current_source_review'}); return; }
  const old = lines[index], updated = old.replace(before, after);
  changes.push({reason, state: 'proposed', index, old, updated});
}
propose('loadConfig().then(()=>reconcileVoice());', 'loadConfig().then(()=>reconcileVoice(voiceUnlocked));',
  'First click before config readiness must still request consent after config arrives.');
propose('stopAudio();voiceSession?.suspend();setState(', 'stopAudio();setState(',
  'Do not suspend during AI/TTS preparation; suspend at actual speaker playback.');
propose("return;}await ask(result.text,'voice');", "return;}voiceSession?.releaseInput();await ask(result.text,'voice');",
  'After accepting ASR, record during answer preparation and queue one complete following question.');
propose('audio._finish=null;speechLevel=0;}', 'audio._finish=null;speechLevel=0;if(voiceWanted&&!voiceBlocked())voiceSession?.resume();}',
  'Cancellation must release stale suspension; inactive sessions remain inactive.');
propose("audio.removeEventListener('playing',onPlaying);audio._finish=null;}",
  "audio.removeEventListener('playing',onPlaying);audio._finish=null;if(voiceWanted&&!voiceBlocked())voiceSession?.resume();}",
  'Listen between played segments while next TTS segment is preparing.');
propose('if(!sessionOn&&!sessionStarting)beginSession();',
  'if(!sessionOn&&!sessionStarting)beginSession();else if(sessionOn&&audio.paused&&!busy)voiceSession?.resume();',
  'Reconcile listening after game, orientation and narration state changes.');
const proposed = changes.filter(change => change.state === 'proposed').sort((a, b) => a.index - b.index);
if (new Set(proposed.map(change => change.index)).size !== proposed.length) throw new Error('Multiple proposals share a line');
let diff = '--- a/public/app.js\n+++ b/public/app.js\n';
for (const change of proposed) diff += `@@ -${change.index + 1},1 +${change.index + 1},1 @@\n-${change.old}\n+${change.updated}\n`;
await writeFile(new URL('../docs/voice-listening-integration.patch', import.meta.url), diff);
await writeFile(new URL('../artifacts/voice-listening-proposal.json', import.meta.url), JSON.stringify({
  sourceSHA256: createHash('sha256').update(original).digest('hex'), sourceUnchanged: true, generatedAt: new Date().toISOString(),
  changes: changes.map(({reason, state, index}) => ({reason, state, line: index === undefined ? undefined : index + 1}))
}, null, 2) + '\n');
process.stdout.write(JSON.stringify({patch: 'docs/voice-listening-integration.patch', proposed: proposed.length,
  needsReview: changes.filter(change => change.state !== 'proposed').length, appEdited: false}) + '\n');
