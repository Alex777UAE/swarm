/**
 * Created by alex on 11.07.17.
 */

import {IUnit} from "./i_unit";
// export type GPUVendor = 'AMD' | 'NVIDIA';
export type GPUModel = 'gtx1070' | 'gtx1080' | 'gtx1080ti' | 'gtx1060' | 'unknown';

/*
 found by type/uuid key for hash, algorithm name as key
 type: GPUModel;
 or by uuid
 uuid?: string; // gpu-59a00a37-8f68-14bf-0a99-5d38080d7977


 gtx1070 => {
    equihash => {
         fanSpeedTarget: number;
         memClockOffset: number;
         gpuClockOffset: number;
         powerLimit: number;
         miner: string; // miner name (key from miner:miners
    },
    neoscrypt => {...}
 }

 gpu-59a00a37-8f68-14bf-0a99-5d38080d7977 => {
     neoscrypt => {
         fanSpeedTarget: number;
         memClockOffset: number;
         gpuClockOffset: number;
         powerLimit: number;
         miner: string; // miner name (key from miner:miners
     }
 }
 */

export type PerAlgorithmGPUConfig = {[algorithm: string]: IGPUConfig};
export type IGPUConfigList = { [modelOurUUID: string]: PerAlgorithmGPUConfig };

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


export interface OverClockMessage {
    fanSpeedTarget: number;
    memClockOffset: number;
    gpuClockOffset: number;
    powerLimit: number;
    algorithm: string;
    miner: string;
    cardId: number;
}

export abstract class IGPU extends IUnit {
    abstract get id(): number;

    abstract get uuid(): string;

    abstract get model(): GPUModel;

    public abstract async getStats(): Promise<IGPUStats>;

    public abstract async init(id: number): Promise<void>;

    public abstract async setup(config: IGPUConfig): Promise<void>;
}