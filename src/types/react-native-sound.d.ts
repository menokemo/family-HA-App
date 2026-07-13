declare module 'react-native-sound' {
  export type SoundCallback = (error?: Error | null) => void;

  export default class Sound {
    static MAIN_BUNDLE: string;
    static DOCUMENT: string;
    static LIBRARY: string;
    static CACHES: string;

    constructor(filename: string | number, callback?: SoundCallback);
    constructor(filename: string, basePath: string, callback?: SoundCallback);

    isLoaded(): boolean;
    play(onEnd?: (success: boolean) => void): this;
    pause(callback?: () => void): this;
    stop(callback?: () => void): this;
    release(): this;
    setNumberOfLoops(value: number): this;
    setCurrentTime(seconds: number): this;
    setVolume(value: number): this;
  }
}
