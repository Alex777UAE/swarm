"use strict";
/**
 * Created by alex on 13.07.17.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const stdout_miner_wrapper_1 = require("./stdout_miner_wrapper");
const util = require('util');
const debug = require('debug')('miner:CCMiner');
const REGEXP_GPU_HASHRATE = /GPU\s*#(\d+):.*,\s*(\d+(\.\d+)?)\s*(((kh)|(th)|(gh)|(mh))\/s)/gi;
const REGEXP_ACCEPTED_HASHRATE_V1 = /accepted:\s+(\d+)\/(\d+)\s+\((.*?)\),\s+(.*?)\s+(((kh)|(th)|(gh)|(mh))\/s)/gi;
const REGEXP_ACCEPTED_HASHRATE_V2 = /\[S\/A\/T]:\s+(\d+)\/(\d+)\/(\d+),.*,\s+(.*)(((kh)|(th)|(gh)|(mh))\/s)/gi;
class CCMiner extends stdout_miner_wrapper_1.StdOutMinerWrapper {
    constructor(name, executable) {
        super(name, executable);
    }
    //noinspection JSMethodCanBeStatic
    get type() {
        return 'ccminer';
    }
    //noinspection JSUnusedGlobalSymbols
    start(coin) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.launchMinerBinary(coin, [
                '-a', coin.algorithm,
                '-o', `stratum+${coin.ssl ? 'ssl' : 'tcp'}://${coin.poolURL}:${coin.port}`,
                '-O', `${coin.username}.${this.worker}:${coin.password}`,
                '--retries=1',
                '--retry-pause=10',
                '--timeout=60',
                '--no-color'
            ], this.parseStdOut.bind(this), this.parseStdOut.bind(this));
        });
    }
    /**
     * ccminer
     Jul 13 22:54:11 K310 ccminer[3564]: accepted: 27/27 (100.00%), 3455.11 kH/s (yay!!!)
     Jul 13 22:54:19 K310 ccminer[3564]: GPU #1: GeForce GTX 1070, 1128.47 kH/s
     Jul 13 22:54:25 K310 ccminer[3564]: GPU #0: GeForce GTX 1070, 1145.40 kH/s
     Jul 13 22:54:33 K310 ccminer[3564]: GPU #0: GeForce GTX 1070, 1149.05 kH/s
     Jul 13 22:54:33 K310 ccminer[3564]: accepted: 28/28 (100.00%), 3452.38 kH/s (yay!!!)
     Jul 13 22:54:35 K310 ccminer[3564]: GPU #2: GeForce GTX 1070, 1143.64 kH/s
     Jul 13 22:54:44 K310 ccminer[3564]: GPU #1: GeForce GTX 1070, 1127.21 kH/s

     Jul 14 01:54:22 K310 ccminer[17832]: [S/A/T]: 0/37/37, diff: 0.013, 40.44MH/s (yes!)
     Jul 14 01:54:29 K310 ccminer[17832]: Stratum difficulty set to 0.15625
     Jul 14 01:54:29 K310 ccminer[17832]: [S/A/T]: 0/47/47, diff: 0.004, 40.38MH/s (yes!)
     Jul 14 01:54:29 K310 ccminer[17832]: [S/A/T]: 0/48/48, diff: 0.006, 40.37MH/s (yes!)
     Jul 14 01:54:31 K310 ccminer[17832]: [S/A/T]: 0/49/49, diff: 0.017, 40.37MH/s (yes!)
     Jul 14 01:54:41 K310 ccminer[17832]: GPU#1:MSI GTX 1070, 13.33MH/s
     Jul 14 01:54:41 K310 ccminer[17832]: [S/A/T]: 0/50/50, diff: 0.165, 40.37MH/s (yes!)
     * @param data
     */
    parseStdOut(data) {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            debug(line);
            const acceptedMatchV1 = REGEXP_ACCEPTED_HASHRATE_V1.exec(line);
            if (acceptedMatchV1) {
                const acceptedShares = acceptedMatchV1[1];
                const totalShares = acceptedMatchV1[2];
                // const acceptedPercentOrDiff = acceptedMatchV1[3];
                const summaryHashrate = acceptedMatchV1[4];
                // const si = acceptedMatchV1[5];
                this.acceptPercent = 100 * parseFloat(acceptedShares) / parseFloat(totalShares);
                this.setTotalHashrate(parseFloat(summaryHashrate));
            }
            else {
                const gpuMatch = REGEXP_GPU_HASHRATE.exec(line);
                if (gpuMatch) {
                    const id = parseInt(gpuMatch[1]);
                    //noinspection UnnecessaryLocalVariableJS
                    const hashrate = parseFloat(gpuMatch[2]);
                    // const si = gpuMatch[4];
                    this.setGPUHashrate(id, hashrate);
                }
                else {
                    const acceptedMatchV2 = REGEXP_ACCEPTED_HASHRATE_V2.exec(line);
                    if (acceptedMatchV2) {
                        // const rejectedShares = acceptedMatchV2[1];
                        const acceptedShares = acceptedMatchV2[2];
                        const totalShares = acceptedMatchV2[3];
                        const summaryHashrate = acceptedMatchV2[4];
                        // const si = acceptedMatchV2[5];
                        this.acceptPercent = 100 * parseFloat(acceptedShares) / parseFloat(totalShares);
                        this.setTotalHashrate(parseFloat(summaryHashrate));
                    }
                }
            }
        });
    }
}
exports.default = CCMiner;
//# sourceMappingURL=ccminer.js.map