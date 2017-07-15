/**
 * Created by alex on 05.07.17.
 */

import {IGPUConfig} from "./i_gpu";

export type Algorithm = 'equihash' | 'ethash' | 'neoscrypt' | 'sib' | 'groestl' | 'myr-gr' | 'lbry' | 'lyra2rev2' |
    'pascal' | 'sia' | 'decred' | 'lyra2v2';

export type ICoinList = { [name: string]: ICoinConfig };

export interface ICoinConfig {
    algorithm: Algorithm;
    poolURL: string;
    port: number;
    username: string;
    password: string;
    ssl: boolean;
    gpuConfigs: { [modelOrUUID: string]: IGPUConfig };
}
