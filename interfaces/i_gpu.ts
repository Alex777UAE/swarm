/**
 * Created by alex on 11.07.17.
 */

import {IUnit} from "./i_unit";
export type GPUVendor = 'AMD' | 'NVIDIA';
export type GPUModel = 'GTX1070' | 'GTX1080' | 'GTX1080ti' | 'GTX1060' | 'unknown';

/*
 found by type
 type: GPUModel;
 or by uuid
 uuid?: string; // GPU-59a00a37-8f68-14bf-0a99-5d38080d7977
 */
export interface IGPUConfig {
    fanSpeedTarget: number;
    memClockOffset: number;
    gpuClockOffset: number;
    powerLimit: number;
    miner: string; // miner name (key from miner:miners
}

export interface IGPUStats {
    gpuLoad: number;
    memLoad: number;
    powerDraw: number;
    temperature: number;
    fanSpeed: number;
    gpuClock: number;
    memClock: number;
}

export abstract class IGPU extends IUnit {
    abstract get id(): number;

    abstract get uuid(): string;

    abstract get model(): GPUModel;

    public abstract async getStats(): Promise<IGPUStats>;

    public abstract async init(id: number): Promise<void>;

    public abstract async setup(config: IGPUConfig): Promise<void>;
}