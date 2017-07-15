"use strict";
/**
 * Created by alex on 02.07.17.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const Debug = require("debug");
const BittrexModule = require("node.bittrex.api");
const debug = Debug('nhbot:bittrex');
const util = require('util');
class Bittrex {
    constructor(apikey, apisecret) {
        this.bittrex = BittrexModule;
        this.bittrex.options({
            apikey,
            apisecret,
            'stream': false,
            'verbose': false,
            'cleartext': false
        });
    }
    getBittrexBTCRate(abbr = 'FTC') {
        const market = 'BTC-' + abbr;
        return new Promise((resolve, reject) => {
            this.bittrex.getticker({ market }, (data) => {
                if (!data.success)
                    return reject(data.message);
                const symbol = this.rate ? (this.rate < data.result.Bid ? '↑ ' :
                    (this.rate > data.result.Bid ? '↓ ' : '= ')) : '';
                debug('Pair [' + market + '] update rate: ' + symbol + util.inspect(data.result.Bid, true, null, true));
                this.rate = data.result.Bid;
                resolve(data.result.Bid);
            });
        });
    }
}
exports.default = Bittrex;
//# sourceMappingURL=bittrex.js.map