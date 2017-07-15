/**
 * Created by alex on 11.07.17.
 */

namespace Units {
    export type MinerType = 'ewbf' | 'ccminer' | 'ethminer' | 'claymore';

    export type IMinerList = {[name: string]: IMinerConfig};

    // is found by name: MinerName;
    export interface IMinerConfig {
        fileType: 'binary' | 'tgz';
        sha256sum: string;
        type: MinerType;
        executable: string;
    }

    export abstract class IMiner extends IUnit {
        constructor(protected executable: string) {
            super();
        }
        public abstract get type(): MinerType;
        public abstract get hashrate(): number;
        public abstract get hashrates(): number[];
        public abstract get acceptedPercent(): number;
        public abstract setWorker(name: string): void;
        public abstract async start(coin: ICoinConfig): Promise<void>;
        public abstract async stop(): Promise<void>;

        // protected abstract
    }
}
