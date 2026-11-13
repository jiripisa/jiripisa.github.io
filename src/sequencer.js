// The project console: every project is one step of a sequencer.
// "Play the catalog" runs a small Berlin School style arpeggio through the projects with Web Audio.
(() => {
  const consoleEl = document.querySelector("[data-console]");
  if (!consoleEl) return;

  const pads = [...consoleEl.querySelectorAll(".pad")];
  const playButton = consoleEl.querySelector("[data-play]");
  const playLabel = consoleEl.querySelector("[data-play-label]");
  const readout = consoleEl.querySelector("[data-readout]");
  const idleText = readout.textContent;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Each section is a chord of A minor, so the arpeggio moves as the catalog moves between sections.
  const chords = {
    music: [45, 48, 52], // A minor
    mac: [48, 52, 55], // C major
    dev: [50, 53, 57], // D minor
    other: [52, 55, 59], // E minor
    archive: [41, 45, 48], // F major
  };
  const shape = [0, 2, 1, 2, 0, 2, 1, 2];
  const octave = [0, 0, 12, 0, 12, 0, 0, 12];

  const stepSeconds = 60 / 118 / 4; // sixteenth notes at 118 BPM
  let audio = null;
  let playing = false;
  let step = 0;
  let nextTime = 0;
  let timer = null;
  let litPad = null;

  // Readout follows the pointer and keyboard focus.
  for (const pad of pads) {
    const show = () => !playing && (readout.textContent = describe(pad));
    const hide = () => !playing && (readout.textContent = idleText);
    pad.addEventListener("pointerenter", show);
    pad.addEventListener("focus", show);
    pad.addEventListener("pointerleave", hide);
    pad.addEventListener("blur", hide);
  }

  playButton.addEventListener("click", () => (playing ? stop() : start()));

  // One sweep of the playhead when the page loads, without sound.
  if (!reducedMotion) {
    pads.forEach((pad, i) => {
      setTimeout(() => light(pad), 300 + i * 55);
    });
    setTimeout(() => light(null), 300 + pads.length * 55 + 120);
  }

  function describe(pad) {
    return pad.dataset.summary ? `${pad.title}: ${pad.dataset.summary}` : pad.title;
  }

  function light(pad) {
    litPad?.classList.remove("is-lit");
    pad?.classList.add("is-lit");
    litPad = pad;
  }

  function start() {
    audio ??= createAudio();
    audio.ctx.resume();
    playing = true;
    step = 0;
    nextTime = audio.ctx.currentTime + 0.08;
    playButton.setAttribute("aria-pressed", "true");
    playLabel.textContent = "Stop";
    timer = setInterval(schedule, 25);
  }

  function stop() {
    playing = false;
    clearInterval(timer);
    playButton.setAttribute("aria-pressed", "false");
    playLabel.textContent = "Play the catalog";
    readout.textContent = idleText;
    light(null);
  }

  function schedule() {
    while (nextTime < audio.ctx.currentTime + 0.12) {
      const pad = pads[step % pads.length];
      const chord = chords[pad.dataset.section] ?? chords.music;
      const note = chord[shape[step % 8]] + octave[step % 8];
      voice(note, nextTime, step);

      const delay = Math.max(0, (nextTime - audio.ctx.currentTime) * 1000);
      setTimeout(() => {
        if (!playing) return;
        light(pad);
        readout.textContent = describe(pad);
      }, delay);

      nextTime += stepSeconds;
      step += 1;
    }
  }

  function createAudio() {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.22;

    // A dotted-eighth echo, the other half of the Berlin School sound.
    const echo = ctx.createDelay(1);
    echo.delayTime.value = stepSeconds * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = "lowpass";
    echoTone.frequency.value = 2200;
    echo.connect(echoTone).connect(feedback).connect(echo);
    echoTone.connect(master);

    master.connect(ctx.destination);
    return { ctx, input: master, echo };
  }

  function voice(midi, time, index) {
    const { ctx, input, echo } = audio;
    const freq = 440 * 2 ** ((midi - 69) / 12);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = "square";
    sub.frequency.value = freq / 2;
    const subLevel = ctx.createGain();
    subLevel.gain.value = 0.35;

    // The filter opens and closes slowly over about 13 seconds.
    const sweep = 0.5 + 0.5 * Math.sin((index * stepSeconds * 2 * Math.PI) / 13);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 9;
    const peak = 500 + 2600 * sweep;
    filter.frequency.setValueAtTime(peak, time);
    filter.frequency.exponentialRampToValueAtTime(180, time + stepSeconds * 1.6);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(0.9, time + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + stepSeconds * 1.8);

    osc.connect(filter);
    sub.connect(subLevel).connect(filter);
    filter.connect(amp);
    amp.connect(input);
    amp.connect(echo);

    const end = time + stepSeconds * 2;
    osc.start(time);
    sub.start(time);
    osc.stop(end);
    sub.stop(end);
  }
})();
