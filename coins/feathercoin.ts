/**
 * Created by alex on 05.07.17.
 */

import * as http from "http";
import * as Debug from 'debug';

const debug = Debug('nhbot:feathercoin');
const STATS_API_URL = 'http://api.feathercoin.com/?output=stats';

interface NetworkStatus {
    blkstoret: number;
    currblk: number;
    days: number;
    exptimeperblk: number;
    hours: number;
    khs: number;
    min: number;
    nextdiff: number;
    nowdiff: number;
    retblk: number;
    sec: number;
    timetoret: number;
    totcm: number;
}

export default class Feathercoin  {
    private getNetworkStatus(): Promise<NetworkStatus> {
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
                    } catch (e) {
                        reject(e.message);
                    }
                });
            }).on('error', reject);
        })
    }

    public async coinsPerTh(): Promise<number> {
        const stats = await this.getNetworkStatus();
        const currentTotalHashrateInKH = stats.khs;

        // network target - 1 block per minute. 60 minutes * 24 hours * 80 coins reward per block
        return 60*24*80 / currentTotalHashrateInKH * 1000000000;
    }

    public async coinsPerGh(): Promise<number> {
        const stats = await this.getNetworkStatus();
        const currentTotalHashrateInKH = stats.khs;

        // network target - 1 block per minute. 60 minutes * 24 hours * 80 coins reward per block
        return 60*24*80 / currentTotalHashrateInKH * 1000000;
    }

    public async coinsPerMh(): Promise<number> {
        const stats = await this.getNetworkStatus();
        const currentTotalHashrateInKH = stats.khs;

        // network target - 1 block per minute. 60 minutes * 24 hours * 80 coins reward per block
        let coinsPerMh = 60*24*80 / currentTotalHashrateInKH * 1000;

        debug(`====> coins per day are now : [ ${coinsPerMh} ]`);

        return coinsPerMh;
    }

}