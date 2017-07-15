/**
 * Created by alex on 13.07.17.
 */
import 'source-map-support/register';
import {StdOutMinerWrapper} from "./stdout_miner_wrapper";
import {MinerType} from "../../interfaces/i_miner";
import {ICoinConfig} from "../../interfaces/i_coin";
const util = require('util');
const debug = require('debug')('miner:ETHMiner');

const REG_EXP = /Mining\s+on\s+Powhash.*?:\s+(\d+\.?\d*)(((kh)|(th)|(gh)|(mh))\/s)\s+\[A(\d+).*R(\d+).*F(\d+)]/gi;

export default //noinspection JSUnusedGlobalSymbols
class ETHMiner extends StdOutMinerWrapper {
    constructor(executable: string) {
        super(executable);
    }

    //noinspection JSMethodCanBeStatic
    public get type(): MinerType {
        return 'ethminer';
    }

    //noinspection JSUnusedGlobalSymbols
    public async start(coin: ICoinConfig): Promise<void> {
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
            const match = REG_EXP.exec(line);
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