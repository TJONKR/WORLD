declare module 'wavefunctioncollapse' {
  interface SimpleTiledModelData {
    tilesize: number;
    tiles: Array<{
      name: string;
      symmetry: string;
      weight?: number;
      bitmap: Uint8Array;
    }>;
    neighbors: Array<{
      left: string;
      right: string;
    }>;
    unique?: boolean;
    subsets?: Record<string, string[]>;
  }

  class SimpleTiledModel {
    FMX: number;
    FMY: number;
    FMXxFMY: number;
    T: number;
    observed: number[] | null;
    wave: boolean[][];

    constructor(
      data: SimpleTiledModelData,
      subsetName: string | null,
      width: number,
      height: number,
      periodic: boolean
    );

    generate(rng?: () => number): boolean;
    iterate(iterations: number, rng?: () => number): boolean;
    clear(): void;
    isGenerationComplete(): boolean;
    graphics(array?: Uint8Array, defaultColor?: number[]): Uint8Array;
  }

  const WFC: {
    SimpleTiledModel: typeof SimpleTiledModel;
    OverlappingModel: unknown;
  };

  export default WFC;
}

declare module 'alea' {
  interface AleaPRNG {
    (): number;
    next(): number;
    uint32(): number;
    fract53(): number;
    exportState(): [number, number, number, number];
    importState(state: [number, number, number, number]): void;
  }

  function Alea(...seeds: Array<string | number>): AleaPRNG;

  export default Alea;
}
