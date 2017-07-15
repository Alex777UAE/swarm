/**
 * Created by alex on 11.07.17.
 */

import {IGPU} from "./i_gpu";
import {ICoinConfig, ICoinList} from "./i_coin";
import {IMinerConfig, IMinerList} from "./i_miner";
import {IUnit} from "./i_unit";
export type OS = 'linux' | 'freebsd' | 'solaris';

export abstract class IRig extends IUnit {
    public abstract get os(): OS;

    public abstract get hostname(): string;

    public abstract get cpu(): string;

    public abstract get uptime(): number;

    public abstract get ip(): string;

    public abstract async getGPUs(): Promise<IGPU[]>;

    public abstract async getLoad(): Promise<{ cpu: number; mem: number }>;

    public abstract async updateCoin(name: string, config: ICoinConfig): Promise<void>;

    public abstract async updateMiner(name: string, config: IMinerConfig, bin: Buffer): Promise<void>;

    public abstract async loadMiners(): Promise<IMinerList>;

    public abstract async loadCoins(): Promise<ICoinList>;

    /*
     should initialize os data, all cards
     set some params, like sysctl etc
     */
    public abstract async init(): Promise<void>;
}
