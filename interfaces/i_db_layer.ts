/**
 * Created by alex on 12.07.17.
 */

import {ICoinConfig, ICoinList} from "./i_coin";
import {IMinerConfig, IMinerList} from "./i_miner";
import {IGPUConfig, IGPUConfigList} from "./i_gpu";
export type DBStats = {[name: string]: {timestamp: number, json: string}};

export abstract class IDBLayer {
    public abstract async getAllCoins(): Promise<ICoinList>;
    public abstract async getAllMiners(): Promise<IMinerList>;
    public abstract async getAllGPUConfigs(): Promise<IGPUConfigList>;
    public abstract async getMinerBinnary(sha256sum: string): Promise<Buffer>;
    public abstract async getCurrentCoin(): Promise<string>;

    public abstract async setCurrentCoin(name: string, nodes?: string[]): Promise<void>;
    public abstract async updateCoin(name: string, config: ICoinConfig): Promise<void>;
    public abstract async updateGPU(name: string, config: IGPUConfig): Promise<void>;
    public abstract async updateMiner(name: string, config: IMinerConfig, binaryPath?: string): Promise<void>;

    public abstract async updateStats(stringifiedJson: string): Promise<void>;
    public abstract async getStats(): Promise<DBStats>;
    public abstract async removeDeadNode(name: string): Promise<void>;
    public abstract async command(name: string, params?: string): Promise<void>;
}