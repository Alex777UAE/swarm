/**
 * Created by alex on 11.07.17.
 */

namespace Units {
    export type OS = 'linux' | 'freebsd' | 'solaris';

    // found by hostname
    export interface IRigConfig {
        os: OS;
        ip: string;
    }

    export abstract class IRig extends IUnit {
        public abstract get os(): OS;
        public abstract get hostname(): string;
        public abstract get cpu(): string;
        public abstract get uptime(): number;
        public abstract get ip(): string;

        public abstract async getGPUs(): Promise<IGPU[]>;
        public abstract async getLoad(): Promise<{cpu: number; mem: number}>;

        public abstract async updateCoin(name: string, config: Units.ICoinConfig): Promise<void>;
        public abstract async updateMiner(name: string, config: Units.IMinerConfig, bin: Buffer): Promise<void>;
        public abstract async loadMiners(): Promise<Units.IMinerList>;
        public abstract async loadCoins(): Promise<Units.ICoinList>;

        /*
            should initialize os data, all cards
            set some params, like sysctl etc
         */
        public abstract async init(): Promise<void>;
    }
}
