/**
 * Created by alex on 13.07.17.
 */
import 'source-map-support/register';
import {StdOutMinerWrapper} from "./stdout_miner_wrapper";
import {MinerType} from "../../interfaces/i_miner";
import {ICoinConfig} from "../../interfaces/i_coin";
const util = require('util');
const debug = require('debug')('miner:Claymore');

const REGEXP_TOTAL_ACCEPTED = /Total\s+Speed:\s+(.*?)\s+.*?:\s+(\d+).*?Rejected:\s+(\d+)/gi;
const REGEXP_PER_GPU_HASHRATE = /GPU(\d+)\s+(.*)\s+(((kh)|(th)|(gh)|(mh))\/s)/gi;

export default //noinspection JSUnusedGlobalSymbols
class Claymore extends StdOutMinerWrapper {
    constructor(name: string, executable: string) {
        super(name, executable);
    }

    //noinspection JSMethodCanBeStatic
    public get type(): MinerType {
        return 'claymore';
    }

    // -epool $URL -ewal $USER.worker -eworker $USER.worker  -epsw $PASS -esm 2 -mode 1 -allpools 1 -allcoins
    public async start(coin: ICoinConfig): Promise<void> {
        await this.launchMinerBinary(coin, [
            '-epool', `${coin.poolURL}:${coin.port}`,
            '-ewal', `${coin.username}.${coin.workername ? coin.workername : this.worker}`,
            '-eworker', `${coin.username}.${coin.workername ? coin.workername : this.worker}`,
            '-epsw', coin.password,
            '-esm', '2',
            '-mode', '1',
            '-colors', '0',
            '-allcoins', '1',
            '-allpools', '1'
        ], this.parseStdOut.bind(this))
    }

    /**
     * claymore
     ETH: 07/14/17-22:45:17 - New job from europe.ethash-hub.miningpoolhub.com:20535
     ETH - Total Speed: 32.287 Mh/s, Total Shares: 2, Rejected: 0, Time: 00:02
     ETH: GPU0 32.287 Mh/s
     ETH: 07/14/17-22:45:26 - New job from europe.ethash-hub.miningpoolhub.com:20535
     ETH - Total Speed: 32.248 Mh/s, Total Shares: 2, Rejected: 0, Time: 00:02
     ETH: GPU0 32.248 Mh/s
     GPU0 t=58C fan=60%
     ETH: 07/14/17-22:45:31 - New job from europe.ethash-hub.miningpoolhub.com:20535
     ETH - Total Speed: 32.224 Mh/s, Total Shares: 2, Rejected: 0, Time: 00:02
     ETH: GPU0 32.224 Mh/s
     ETH: 07/14/17-22:45:33 - New job from europe.ethash-hub.miningpoolhub.com:20535
     ETH - Total Speed: 32.298 Mh/s, Total Shares: 2, Rejected: 0, Time: 00:02
     ETH: GPU0 32.298 Mh/s
     GPU0 t=58C fan=60%
     ETH: 07/14/17-22:46:05 - SHARE FOUND - (GPU 0)
     ETH: Share accepted (63 ms)!
     ETH: 07/14/17-22:46:09 - New job from europe.ethash-hub.miningpoolhub.com:20535
     ETH - Total Speed: 32.139 Mh/s, Total Shares: 3, Rejected: 0, Time: 00:03
     ETH: GPU0 32.139 Mh/s
     ETH: 07/14/17-22:46:14 - SHARE FOUND - (GPU 0)
     ETH: Share accepted (62 ms)!
     GPU0 t=58C fan=60%
     ETH: 07/14/17-22:46:57 - New job from europe.ethash-hub.miningpoolhub.com:20535
     ETH - Total Speed: 32.293 Mh/s, Total Shares: 4, Rejected: 0, Time: 00:04
     ETH: GPU0 32.293 Mh/s
     GPU0 t=58C fan=60%
     ETH: 07/14/17-22:47:10 - New job from europe.ethash-hub.miningpoolhub.com:20535
     ETH - Total Speed: 31.956 Mh/s, Total Shares: 4, Rejected: 0, Time: 00:04
     ETH: GPU0 31.956 Mh/s
     */


    protected parseStdOut(data: string): void {
        const lines = data.split('\n');
        lines.forEach(line => {
            debug(line);
            const match = REGEXP_TOTAL_ACCEPTED.exec(line);
            if (match) {
                const summaryHashrate = parseFloat(match[1]);
                const acceptedShares = parseFloat(match[2]);
                const rejectedShares = parseFloat(match[3]);
                this.setTotalHashrate(summaryHashrate);
                this.acceptPercent = 100 * acceptedShares / (acceptedShares + rejectedShares);
            } else {
                const gpuMatch = REGEXP_PER_GPU_HASHRATE.exec(line);
                if (match) {
                    const id = parseInt(gpuMatch[1]);
                    //noinspection UnnecessaryLocalVariableJS
                    const hashrate = parseFloat(gpuMatch[2]);
                    // const si = gpuMatch[4];
                    this.setGPUHashrate(id, hashrate);
                }
            }
        });
    }
}