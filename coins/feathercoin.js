"use strict";
/**
 * Created by alex on 05.07.17.
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
const http = require("http");
const Debug = require("debug");
const debug = Debug('nhbot:feathercoin');
const STATS_API_URL = 'http://api.feathercoin.com/?output=stats';
class Feathercoin {
    getNetworkStatus() {
        return new Promise((resolve, reject) => {
            http.get(STATS_API_URL, (res) => {
                const { statusCode } = res;
                // let contentType = res.headers['content-type'];
                // if (isArray(contentType)) contentType = contentType[0];
                let error;
                if (statusCode !== 200) {
                    error = new Error('Request Failed.\n' +
                        `Status Code: ${statusCode}`);
                } /*else if (!/^application\/json/.test(contentType)) {
                    error = new Error('Invalid content-type.\n' +
                        `Expected application/json but received ${contentType}`);
                }*/
                if (error) {
                    res.resume();
                    reject(error.message);
                    // consume response data to free up memory
                    return;
                }
                res.setEncoding('utf8');
                let rawData = '';
                res.on('data', (chunk) => { rawData += chunk; });
                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(rawData);
                        resolve(parsedData);
                    }
                    catch (e) {
                        reject(e.message);
                    }
                });
            }).on('error', reject);
        });
    }
    coinsPerTh() {
        return __awaiter(this, void 0, void 0, function* () {
            const stats = yield this.getNetworkStatus();
            const currentTotalHashrateInKH = stats.khs;
            // network target - 1 block per minute. 60 minutes * 24 hours * 80 coins reward per block
            return 60 * 24 * 80 / currentTotalHashrateInKH * 1000000000;
        });
    }
    coinsPerGh() {
        return __awaiter(this, void 0, void 0, function* () {
            const stats = yield this.getNetworkStatus();
            const currentTotalHashrateInKH = stats.khs;
            // network target - 1 block per minute. 60 minutes * 24 hours * 80 coins reward per block
            return 60 * 24 * 80 / currentTotalHashrateInKH * 1000000;
        });
    }
    coinsPerMh() {
        return __awaiter(this, void 0, void 0, function* () {
            const stats = yield this.getNetworkStatus();
            const currentTotalHashrateInKH = stats.khs;
            // network target - 1 block per minute. 60 minutes * 24 hours * 80 coins reward per block
            let coinsPerMh = 60 * 24 * 80 / currentTotalHashrateInKH * 1000;
            debug(`====> coins per day are now : [ ${coinsPerMh} ]`);
            return coinsPerMh;
        });
    }
}
exports.default = Feathercoin;
//# sourceMappingURL=feathercoin.js.map