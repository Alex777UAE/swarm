/**
 * Created by alex on 05.07.17.
 */

namespace Units {
    export type Algorithm = 'equihash' | 'ethash' | 'neoscrypt'| 'sib' | 'groestl' | 'myr-gr' | 'lbry' | 'lyra2rev2' |
        'pascal' | 'sia' | 'decred' | 'lyra2v2';

    export type ICoinList = {[name: string]: ICoinConfig};

    export interface ICoinConfig {
        algorithm: Algorithm;
        poolURL: string;
        port: string;
        username: string;
        password: string;
        ssl: boolean;
        gpuConfigs: {[typeOrUUID: string]: IGPUConfig};
    }
}
