/**
 * Created by alex on 12.07.17.
 */

export type DBStats = {[name: string]: {timestamp: number, json: string}};

export abstract class IDBLayer {
    public abstract async getAllCoins(): Promise<Units.ICoinList>;
    public abstract async getAllMiners(): Promise<Units.IMinerList>;
    public abstract async getMinerBinnary(sha256sum: string): Promise<Buffer>;
    public abstract async getCurrentCoin(): Promise<string>;

    public abstract async setCurrentCoin(name: string, nodes?: string[]): Promise<void>;
    public abstract async updateCoin(name: string, config: Units.ICoinConfig): Promise<void>;
    public abstract async updateMiner(name: string, config: Units.IMinerConfig, binaryPath?: string): Promise<void>;

    public abstract async updateStats(stringifiedJson: string): Promise<void>;
    public abstract async getStats(): Promise<DBStats>;
    public abstract async removeDeadNode(name: string): Promise<void>;
}