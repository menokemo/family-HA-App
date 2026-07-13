import {useEffect, useMemo} from 'react';
import Sound from 'react-native-sound';

class SirenPlayer {
  private sound?: Sound;
  private loaded = false;
  private pendingPlay = false;
  loop = false;

  constructor(filename: string) {
    this.sound = new Sound(filename, Sound.MAIN_BUNDLE, error => {
      if (error) {
        this.sound = undefined;
        this.loaded = false;
        this.pendingPlay = false;
        return;
      }

      this.loaded = true;
      this.sound?.setNumberOfLoops(this.loop ? -1 : 0);
      if (this.pendingPlay) {
        this.play();
      }
    });
  }

  play() {
    if (!this.loaded || !this.sound) {
      this.pendingPlay = true;
      return;
    }

    this.pendingPlay = false;
    this.sound.setNumberOfLoops(this.loop ? -1 : 0);
    this.sound.play();
  }

  pause() {
    this.pendingPlay = false;
    if (this.loaded) {
      this.sound?.pause();
    }
  }

  seekTo(seconds: number) {
    if (this.loaded) {
      this.sound?.setCurrentTime(seconds);
    }
  }

  release() {
    this.pendingPlay = false;
    if (this.loaded) {
      this.sound?.release();
    }
    this.sound = undefined;
    this.loaded = false;
  }
}

export function useSirenPlayers() {
  const players = useMemo(
    () => ({
      classic: new SirenPlayer('siren_classic.wav'),
      digital: new SirenPlayer('siren_digital.wav'),
      pulse: new SirenPlayer('siren_pulse.wav'),
    }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(players).forEach(player => player.release());
    },
    [players],
  );

  return players;
}
