class SoundManager {
  soundDiv: HTMLDivElement;
  freeSounds: Array<HTMLAudioElement> = new Array<HTMLAudioElement>();

  constructor(public soundAsset: string, public duration: number, initialCount: number) {
    this.soundDiv = document.getElementById('sounds') as HTMLDivElement;
    for (let i = 0; i < initialCount; ++i) {
      this.freeSounds.push(this.createAudio(soundAsset));
    }
  }

  createAudio(soundAsset: string): HTMLAudioElement {
    let audio = document.createElement('audio') as HTMLAudioElement;
    audio.src = soundAsset;
    audio.preload = 'auto';
    this.soundDiv.appendChild(audio);
    return audio;
  }

  play(): void {
    if (this.freeSounds.length === 0) {
      this.freeSounds.push(this.createAudio(this.soundAsset));
    }
    let audio = this.freeSounds.pop();
    audio.currentTime = 0;
    audio.play();
    setTimeout(() => {
      this.freeSounds.push(audio);
    }, this.duration * 1000);
  }
}

export const soundManager = new SoundManager('sounds/single-firework-79814.mp3', 1.5, 10);