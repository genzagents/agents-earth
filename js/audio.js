/**
 * AgentColony — Ambient Audio System
 * Plays environment-appropriate background sounds
 */

class AmbientAudio {
  constructor() {
    this.context = null;
    this.enabled = false;
    this.currentTrack = null;
    this.volume = 0.3;
    this.oscillators = [];
  }

  init() {
    if (this.context) return;
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.context.destination);
      this.enabled = true;
    } catch (e) {
      console.warn('Audio not available:', e);
    }
  }

  toggle() {
    if (!this.context) this.init();
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.context.resume();
      this.masterGain.gain.setValueAtTime(this.volume, this.context.currentTime);
    } else {
      this.masterGain.gain.setValueAtTime(0, this.context.currentTime);
      this.stopAll();
    }
    return this.enabled;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.volume, this.context.currentTime);
    }
  }

  // Generate ambient drone based on environment
  playAmbient(environment) {
    if (!this.enabled || !this.context) return;
    this.stopAll();

    const env = ENVIRONMENTS[environment] || ENVIRONMENTS.day;
    
    env.tones.forEach(tone => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      
      osc.type = tone.type || 'sine';
      osc.frequency.value = tone.freq;
      gain.gain.value = tone.vol * this.volume;
      
      // Slow LFO modulation for organic feel
      const lfo = this.context.createOscillator();
      const lfoGain = this.context.createGain();
      lfo.frequency.value = tone.lfoRate || 0.1;
      lfoGain.gain.value = tone.lfoDepth || 5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      lfo.start();
      
      this.oscillators.push({ osc, gain, lfo, lfoGain });
    });

    this.currentTrack = environment;
  }

  stopAll() {
    this.oscillators.forEach(({ osc, lfo }) => {
      try { osc.stop(); } catch(e) {}
      try { lfo.stop(); } catch(e) {}
    });
    this.oscillators = [];
    this.currentTrack = null;
  }

  // Update based on time period
  updateForPeriod(period) {
    const envMap = {
      'night': 'night',
      'morning': 'morning',
      'work-morning': 'day',
      'lunch': 'day',
      'work-afternoon': 'day',
      'evening': 'evening',
      'social': 'evening',
    };
    const env = envMap[period] || 'day';
    if (env !== this.currentTrack) {
      this.playAmbient(env);
    }
  }
}

// Ambient sound environments using Web Audio synthesis
const ENVIRONMENTS = {
  morning: {
    tones: [
      { freq: 220, vol: 0.02, type: 'sine', lfoRate: 0.05, lfoDepth: 2 },   // Warm base
      { freq: 440, vol: 0.008, type: 'sine', lfoRate: 0.08, lfoDepth: 3 },  // High harmonic
      { freq: 330, vol: 0.01, type: 'triangle', lfoRate: 0.03, lfoDepth: 1 }, // Mid tone
    ]
  },
  day: {
    tones: [
      { freq: 180, vol: 0.015, type: 'sine', lfoRate: 0.04, lfoDepth: 3 },   // City hum
      { freq: 360, vol: 0.006, type: 'triangle', lfoRate: 0.07, lfoDepth: 2 }, // Activity
      { freq: 520, vol: 0.004, type: 'sine', lfoRate: 0.12, lfoDepth: 4 },   // Brightness
    ]
  },
  evening: {
    tones: [
      { freq: 165, vol: 0.02, type: 'sine', lfoRate: 0.03, lfoDepth: 2 },   // Settling
      { freq: 247, vol: 0.01, type: 'triangle', lfoRate: 0.05, lfoDepth: 3 }, // Warmth
      { freq: 110, vol: 0.008, type: 'sine', lfoRate: 0.02, lfoDepth: 1 },  // Low drone
    ]
  },
  night: {
    tones: [
      { freq: 80, vol: 0.015, type: 'sine', lfoRate: 0.02, lfoDepth: 1 },    // Deep night
      { freq: 160, vol: 0.008, type: 'sine', lfoRate: 0.04, lfoDepth: 2 },   // Mystery
      { freq: 120, vol: 0.005, type: 'triangle', lfoRate: 0.01, lfoDepth: 1 }, // Quiet
    ]
  },
  space: {
    tones: [
      { freq: 60, vol: 0.02, type: 'sine', lfoRate: 0.01, lfoDepth: 3 },     // Void
      { freq: 90, vol: 0.01, type: 'sine', lfoRate: 0.008, lfoDepth: 2 },    // Cosmic
      { freq: 200, vol: 0.004, type: 'sine', lfoRate: 0.15, lfoDepth: 8 },   // Twinkle
    ]
  }
};

// Global instance
window.ambientAudio = new AmbientAudio();