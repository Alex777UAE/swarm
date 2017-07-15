/**
 * Created by alex on 02.07.17.
 */

import * as Debug from 'debug';
import * as BittrexModule from 'node.bittrex.api';

const debug = Debug('nhbot:bittrex');
const util = require('util');

export interface BittrexTicker {
    Bid: number;
    Ask: number;
    Last: number;
}

export interface BittrexTickerResponse {
    success: boolean;
    message: string;
    result: null & BittrexTicker;
}

export default class Bittrex {
    protected bittrex: any = BittrexModule;

    protected rate: number;

    constructor (apikey: string, apisecret: string) {
        this.bittrex.options({
            apikey,
            apisecret,
            'stream': false, // will be removed from future versions
            'verbose': false,
            'cleartext': false
        });
    }

    public getBittrexBTCRate(abbr: string = 'FTC'): Promise<number> {
        const market = 'BTC-' + abbr;

        return new Promise((resolve, reject) => {
            this.bittrex.getticker({market}, (data: BittrexTickerResponse) => {
                if (!data.success) return reject(data.message);
                const symbol = this.rate ? (this.rate < data.result.Bid ? '↑ ' :
                    (this.rate > data.result.Bid ? '↓ ' : '= ')) : '';
                debug('Pair [' + market + '] update rate: ' + symbol + util.inspect(data.result.Bid, true, null, true));
                this.rate = data.result.Bid;
                resolve(data.result.Bid);
            });
        });
    }
}