// Decode stems on demand and schedule each lane against the same audio clock.
class StemWorkspace extends HTMLElement {
  selection = '';
  files = [];
  lanes = [];
  offset = 0;
  started = null;

  connectedCallback() {
    this.innerHTML = `<section class="workflow-section"><h3>Stem workspace</h3>
      <div class="workflow-actions"><button class="btn" data-load>Load waveforms</button>
      <button class="btn" data-play disabled>Play</button>
      <input type="range" data-seek aria-label="Playback position" min="0" max="0" step="0.01" value="0" disabled>
      <output data-time>0:00</output></div>
      <p data-message role="status"></p><div data-lanes></div></section>`;
    this.loadButton = this.querySelector('[data-load]');
    this.playButton = this.querySelector('[data-play]');
    this.seek = this.querySelector('[data-seek]');
    this.clock = this.querySelector('[data-time]');
    this.message = this.querySelector('[data-message]');
    this.rows = this.querySelector('[data-lanes]');
    this.loadButton.onclick = () => this.load();
    this.playButton.onclick = () => this.started === null ? this.play() : this.pause();
    this.seek.oninput = () => {
      const resume = this.started !== null;
      const offset = Number(this.seek.value);
      this.pause();
      this.offset = offset;
      this.drawTime();
      if (resume) this.play();
    };
  }

  select(track) {
    const files = track?.prepped_stems || [];
    const selection = JSON.stringify([track?.name, files]);
    if (selection === this.selection) return;
    this.selection = selection;
    this.storageKey = 'studio-stem-mix:' + track?.name;
    this.files = files;
    this.cancel?.abort();
    this.pause();
    this.context?.close();
    this.context = null;
    this.offset = 0;
    this.lanes = [];
    this.rows.replaceChildren();
    this.seek.disabled = this.playButton.disabled = true;
    this.loadButton.disabled = !files.length;
    this.message.textContent = files.length ? 'Load stems to audition a mix. Levels are saved in this browser.' : 'Prepared stems will appear here.';
    this.drawTime();
  }

  async load() {
    this.loadButton.disabled = true;
    const selection = this.selection;
    this.cancel = new AbortController();
    try {
      const context = this.context = new AudioContext();
      const lanes = [];
      for (const file of this.files) {
        this.message.textContent = 'Loading ' + file.name;
        const response = await fetch('/api/audio?path=' + encodeURIComponent(file.rel_path), {signal: this.cancel.signal});
        if (!response.ok) throw Error('Could not load ' + file.name);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (this.selection !== selection || this.context !== context) return;
        const gain = context.createGain();
        gain.connect(context.destination);
        lanes.push({file, buffer, gain});
      }
      this.lanes = lanes;
      this.duration = Math.max(...lanes.map(lane => lane.buffer.duration));
      this.seek.max = this.duration;
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(this.storageKey)) || {}; } catch {}
      for (const lane of lanes) this.addRow(lane, saved[lane.file.name] || {});
      this.applyLevels();
      this.seek.disabled = this.playButton.disabled = false;
      this.message.textContent = 'Audition levels apply to playback only.';
    } catch (err) {
      if (this.selection !== selection || err.name === 'AbortError') return;
      this.context?.close();
      this.context = null;
      this.message.textContent = err.message;
      this.loadButton.disabled = false;
    }
  }

  addRow(lane, saved) {
    const row = document.createElement('div');
    row.className = 'stem-lane';
    row.innerHTML = `<strong></strong><canvas width="500" height="40" aria-hidden="true"></canvas>
      <div class="workflow-actions"><label>Level <input type="range" min="0" max="1" step=".01"></label>
      <label><input type="checkbox"> Mute</label><label><input type="checkbox"> Solo</label></div>`;
    row.querySelector('strong').textContent = lane.file.name;
    const [level, mute, solo] = row.querySelectorAll('input');
    level.value = saved.level ?? 1;
    mute.checked = saved.mute === true;
    solo.checked = saved.solo === true;
    Object.assign(lane, {level, mute, solo});
    row.oninput = () => {
      this.applyLevels();
      const settings = Object.fromEntries(this.lanes.map(l => [l.file.name,
        {level: Number(l.level.value), mute: l.mute.checked, solo: l.solo.checked}]));
      try { localStorage.setItem(this.storageKey, JSON.stringify(settings)); } catch {}
    };
    const canvas = row.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#53e0d3';
    const data = lane.buffer.getChannelData(0);
    const width = Math.max(1, Math.round(canvas.width * lane.buffer.duration / this.duration));
    for (let x = 0; x < width; x++) {
      let peak = 0;
      const end = Math.floor((x + 1) * data.length / width);
      for (let i = Math.floor(x * data.length / width); i < end; i++) peak = Math.max(peak, Math.abs(data[i]));
      ctx.fillRect(x, 20 - peak * 20, 1, Math.max(1, peak * 40));
    }
    this.rows.append(row);
  }

  applyLevels() {
    const solos = this.lanes.some(lane => lane.solo.checked);
    for (const lane of this.lanes) {
      lane.gain.gain.value = lane.mute.checked || (solos && !lane.solo.checked) ? 0 : Number(lane.level.value);
    }
  }

  async play() {
    const context = this.context;
    if (!context || !this.lanes.length) return;
    try { await context.resume(); } catch { return; }
    if (this.context !== context || this.started !== null) return;
    stopAllAudio();
    if (this.offset >= this.duration) this.offset = 0;
    const when = context.currentTime + 0.05;
    for (const lane of this.lanes) {
      if (this.offset >= lane.buffer.duration) continue;
      const source = lane.source = context.createBufferSource();
      source.buffer = lane.buffer;
      source.connect(lane.gain);
      source.start(when, this.offset);
    }
    this.started = when - this.offset;
    this.playButton.textContent = 'Pause';
    this.drawTime();
  }

  pause() {
    if (this.started === null) return;
    this.offset = Math.min(this.duration, Math.max(0, this.context.currentTime - this.started));
    this.started = null;
    for (const lane of this.lanes) {
      lane.source?.stop();
      lane.source?.disconnect();
      lane.source = null;
    }
    cancelAnimationFrame(this.frame);
    this.playButton.textContent = 'Play';
    this.drawTime();
  }

  drawTime() {
    const t = this.started === null ? this.offset : Math.max(0, this.context.currentTime - this.started);
    this.seek.value = t;
    this.clock.value = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    if (this.started !== null) {
      if (t >= this.duration) this.pause();
      else this.frame = requestAnimationFrame(() => this.drawTime());
    }
  }
}
customElements.define('stem-workspace', StemWorkspace);
