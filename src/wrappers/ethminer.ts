/**
 * Created by alex on 13.07.17.
 */
import 'source-map-support/register';
import * as colors from 'colors';
import {StdOutMinerWrapper} from "./stdout_miner_wrapper";
import {MinerType} from "../../interfaces/i_miner";
import {ICoinConfig} from "../../interfaces/i_coin";
const util = require('util');
const debug = require('debug')('miner:ETHMiner');

const REG_EXP = /Mining\s+on\s+Powhash.*?:\s+(\d+\.?\d*)(((kh)|(th)|(gh)|(mh))\/s)\s+\[A(\d+).*R(\d+).*F(\d+)]/gi;

const hrsDumb = new Array(16).fill(-1);

export default //noinspection JSUnusedGlobalSymbols
class ETHMiner extends StdOutMinerWrapper {
    constructor(name: string, executable: string) {
        super(name, executable);
    }

    //noinspection JSMethodCanBeStatic
    public get type(): MinerType {
        return 'ethminer';
    }

    public get hashrates(): number[] {
        return hrsDumb;
    }

    //noinspection JSUnusedGlobalSymbols
    public async start(coin: ICoinConfig): Promise<void> {
        await this.launchMinerBinary(coin, [
            '-S', `${coin.poolURL}:${coin.port}`,
            '-O', `${coin.username}.${coin.workername ? coin.workername : this.worker}:${coin.password}`,
            '-U',
            '--farm-recheck', '2000',
            '--cuda-schedule', 'auto'
        ], this.parseStdOut.bind(this), this.parseStdOut.bind(this))
    }


    /**
     * ethminer
     m  23:07:29|main  Mining on PoWhash #bb397e32 : 29.13MH/s [A58+0:R0+0:F0]
     m  23:07:31|main  Mining on PoWhash #bb397e32 : 33.83MH/s [A58+0:R0+0:F0]
     m  23:07:33|main  Mining on PoWhash #bb397e32 : 33.83MH/s [A58+0:R0+0:F0]
     m  23:07:35|main  Mining on PoWhash #bb397e32 : 34.35MH/s [A58+0:R0+0:F0]
     */


    protected parseStdOut(data: string): void {
        const lines = data.split('\n');
        lines.forEach(line => {
            debug(line);
            const match = REG_EXP.exec(colors.strip(line));
            if (match) {
                const summaryHashrate = parseFloat(match[1]);
                const acceptedShares = parseFloat(match[8]);
                const rejectedShares = parseFloat(match[9]);
                const faultShares = parseFloat(match[10]);
                this.setTotalHashrate(summaryHashrate);
                this.acceptPercent = 100 * acceptedShares / (acceptedShares + rejectedShares + faultShares);
            }
        });
    }
}