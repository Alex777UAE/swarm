/**
 * Created by alex on 05.07.17.
 */

export type Algorithm = 'equihash' | 'neoscrypt' | 'groestl' | 'myr-gr' | 'dmd-gr' | 'sia' | 'sib' | 'lyra2v2' |
    'decred' | 'lbry' | 'x11gost' | 'cryptonight' | 'ethash';

export type ICoinList = { [name: string]: ICoinConfig };

// found by coin name (zec,ftc,...) in miner:coins hash
export interface ICoinConfig {
    algorithm: Algorithm;
    poolURL: string;
    port: number;
    username: string;
    password: string;
    workername?: string;
}
