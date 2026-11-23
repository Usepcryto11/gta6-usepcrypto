// All sound is synthesised with WebAudio — no audio files, no network.
// Engine hum follows speed, the siren wails while the police are after you,
// gunshots and pickups are short noise/tone bursts. Created lazily on the first
// user gesture, so a page that never gets input stays silent.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let sirenOn = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, dur, type, vol) {
    if (!ensure() || muted) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch { /* sound is best-effort */ }
  }

  function noise(dur, vol) {
    if (!ensure() || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(g);
      g.connect(master);
      src.start();
    } catch { /* sound is best-effort */ }
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
    muted() { return muted; },
    /** Called every frame: engine pitch by speed, siren while wanted. */
    update(speed, wanted, dt) {
      if (!ctx || muted) return;
      try {
        engineGain.gain.setTargetAtTime(0.02 + Math.min(0.09, Math.abs(speed) / 6000), ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(45 + Math.abs(speed) / 6, ctx.currentTime, 0.1);
        const wantSiren = wanted > 0;
        if (wantSiren !== sirenOn) sirenOn = wantSiren;
        if (sirenOn) {
          sirenGain.gain.setTargetAtTime(0.03, ctx.currentTime, 0.2);
          sirenOsc.frequency.setTargetAtTime(650 + 250 * Math.sin(performance.now() / 350), ctx.currentTime, 0.05);
        } else {
          sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        }
      } catch { /* ignore */ }
      void dt;
    },
    shoot() { noise(0.12, 0.5); },
    punch() { noise(0.08, 0.3); },
    pickup() { blip(880, 0.12, 'sine', 0.25); blip(1320, 0.15, 'sine', 0.2); },
    mission() { blip(523, 0.15, 'triangle', 0.3); blip(659, 0.15, 'triangle', 0.3); blip(784, 0.3, 'triangle', 0.3); },
    busted() { blip(220, 0.4, 'sawtooth', 0.3); blip(165, 0.6, 'sawtooth', 0.3); },
    crash() { noise(0.2, 0.4); },
  };
}
