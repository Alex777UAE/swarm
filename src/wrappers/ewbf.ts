/**
 * Created by alex on 13.07.17.
 */
import 'source-map-support/register';
import {StdOutMinerWrapper} from "./stdout_miner_wrapper";
import {MinerType} from "../../interfaces/i_miner";
import {ICoinConfig} from "../../interfaces/i_coin";
const util = require('util');
const debug = require('debug')('miner:EWBFMiner');

const REGEXP_GPU_HASHRATE = /(GPU(\d+):\s+(\d+)\s+sol\/s)/gi;
const REGEXP_TOTAL_HASHRATE = /Total\s+speed:\s+(\d+)\s+sol\/s/gi;
const REGEXP_ACCEPTED_SHARES = /GPU(\d+)\s+Accepted\s+share\s+.*\[A:(\d+),\s+R:(\d+)]/gi;
const ERROR_PATTERN = /Looks\s+like\s+GPU(.*?)\s+are stopped.\s+Restart\s+/gi;


export default //noinspection JSUnusedGlobalSymbols
class EWBFMiner extends StdOutMinerWrapper {
    protected accPcntArray: {[gpuId: number]: number} = {};

    constructor(name: string, executable: string) {
        super(name, executable);
    }

    //noinspection JSMethodCanBeStatic
    public get type(): MinerType {
        return 'ewbf';
    }

    public get acceptedPercent(): number {
        const gpuIdArray = Object.keys(this.accPcntArray);
        const avPercent = gpuIdArray.reduce((total, gpuId) => total + this.accPcntArray[gpuId], 0) / gpuIdArray.length || 1;
        return parseFloat(avPercent.toFixed(2));
    }

    //noinspection JSUnusedGlobalSymbols
    public async start(coin: ICoinConfig): Promise<void> {
        await this.launchMinerBinary(coin, [
            '--server', coin.poolURL,
            '--port', coin.port.toString(),
            '--user', `${coin.username}.${this.worker}`,
            '--pass', coin.password,
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
                const summaryHashrate = totalMatch[1];
                this.setTotalHashrate(parseInt(summaryHashrate));
            } else {
                const shares = REGEXP_ACCEPTED_SHARES.exec(line);
                if (shares) {
                    const gpuId = parseInt(shares[1]);
                    const acceptedShares = parseInt(shares[2]);
                    const rejectedShares = parseInt(shares[3]);
                    this.accPcntArray[gpuId] = 100 * acceptedShares / (acceptedShares + rejectedShares);
                } else {
                    const error = ERROR_PATTERN.exec(line);
                    if (error) {
                        const coin = Object.assign({}, this.coin);
                        this.stop()
                            .then(() => this.start(coin))
                            .catch(debug);
                    } else {
                        let gpuMatch;
                        while (gpuMatch = REGEXP_GPU_HASHRATE.exec(line)) {
                            const id = parseInt(gpuMatch[2]);
                            const hashrate = parseInt(gpuMatch[3]);
                            this.setGPUHashrate(id, hashrate);
                        }
                    }
                }
            }
        });
    }
}