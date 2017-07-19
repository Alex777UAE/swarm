"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Created by alex on 13.07.17.
 */
require("source-map-support/register");
const colors = require("colors");
const stdout_miner_wrapper_1 = require("./stdout_miner_wrapper");
const util = require('util');
const debug = require('debug')('miner:ETHMiner');
const REG_EXP = /Mining\s+on\s+Powhash.*?:\s+(\d+\.?\d*)(((kh)|(th)|(gh)|(mh))\/s)\s+\[A(\d+).*R(\d+).*F(\d+)]/gi;
const hrsDumb = new Array(16).fill(-1);
class ETHMiner extends stdout_miner_wrapper_1.StdOutMinerWrapper {
    constructor(name, executable) {
        super(name, executable);
    }
    //noinspection JSMethodCanBeStatic
    get type() {
        return 'ethminer';
    }
    get hashrates() {
        return hrsDumb;
    }
    //noinspection JSUnusedGlobalSymbols
    start(coin) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.launchMinerBinary(coin, [
                '-S', `${coin.poolURL}:${coin.port}`,
                '-O', `${coin.username}.${coin.workername ? coin.workername : this.worker}:${coin.password}`,
                '-U',
                '--farm-recheck', '2000',
                '--cuda-schedule', 'auto'
            ], this.parseStdOut.bind(this), this.parseStdOut.bind(this));
        });
    }
    /**
     * ethminer
     m  23:07:29|main  Mining on PoWhash #bb397e32 : 29.13MH/s [A58+0:R0+0:F0]
     m  23:07:31|main  Mining on PoWhash #bb397e32 : 33.83MH/s [A58+0:R0+0:F0]
     m  23:07:33|main  Mining on PoWhash #bb397e32 : 33.83MH/s [A58+0:R0+0:F0]
     m  23:07:35|main  Mining on PoWhash #bb397e32 : 34.35MH/s [A58+0:R0+0:F0]
     */
    parseStdOut(data) {
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
exports.default = ETHMiner;
//# sourceMappingURL=ethminer.js.map