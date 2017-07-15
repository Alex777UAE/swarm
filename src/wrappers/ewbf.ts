/**
 * Created by alex on 13.07.17.
 */
import {StdOutMinerWrapper} from "./stdout_miner_wrapper";
const util = require('util');
const debug = require('debug')('miner:EWBFMiner');

const REGEXP_GPU_HASHRATE = /(GPU(\d+):\s+(\d+)\s+sol\/s)/gi;
const REGEXP_TOTAL_HASHRATE = /Total\s+speed:\s+(\d+)\s+sol\/s/gi;
const REGEXP_ACCEPTED_SHARES = /GPU(\d+)\s+Accepted\s+share\s+.*\[A:(\d+),\s+R:(\d+)]/gi;

export default //noinspection JSUnusedGlobalSymbols
class EWBFMiner extends StdOutMinerWrapper {
    protected accPcntArray: {[gpuId: number]: number};

    constructor(executable: string) {
        super(executable);
    }

    public get type(): Units.MinerType {
        return 'ewbf';
    }

    public get acceptedPercent(): number {
        const gpuIdArray = Object.keys(this.accPcntArray);
        const avPercent = gpuIdArray.reduce((total, gpuId) => total + this.accPcntArray[gpuId], 0) / gpuIdArray.length;
        return parseFloat(avPercent.toFixed(2));
    }

    public async start(coin: Units.ICoinConfig): Promise<void> {
        await this.launchMinerBinary(coin, [
            `--server ${coin.poolURL}`,
            `--port ${coin.port}`,
            `--user ${coin.username}.${this.worker}`,
            `--pass ${coin.password}`,
            '--fee 0',
            '--boff',
            '--eexit 3'
        ], this.parseStdOut.bind(this))
    }

    /**
     *
     EWBF miner Temp: GPU0: 62C GPU1: 62C GPU2: 58C
     EWBF miner GPU0: 497 Sol/s GPU1: 485 Sol/s GPU2: 486 Sol/s
     EWBF miner Total speed: 1468 Sol/s
     EWBF miner INFO 23:36:01: GPU1 Accepted share 45ms [A:92, R:0]
     */

    protected parseStdOut(data: string): void {
        const lines = data.split('\n');
        lines.forEach(line => {
            debug(line);
            const totalMatch = REGEXP_TOTAL_HASHRATE.exec(line);
            if (totalMatch) {
                const summaryHashrate = totalMatch[4];
                this.setTotalHashrate(parseInt(summaryHashrate));
            } else {
                const shares = REGEXP_ACCEPTED_SHARES.exec(line);
                if (shares) {
                    const gpuId = parseInt(shares[1]);
                    const acceptedShares = parseInt(shares[2]);
                    const rejectedShares = parseInt(shares[3]);
                    this.accPcntArray[gpuId] = 100 * acceptedShares / (acceptedShares + rejectedShares);
                } else {
                    let gpuMatch;
                    while (gpuMatch = REGEXP_GPU_HASHRATE.exec(line)) {
                        const id = parseInt(gpuMatch[2]);
                        const hashrate = parseInt(gpuMatch[3]);
                        this.setGPUHashrate(id, hashrate);
                    }
                }
            }
        });
    }
}