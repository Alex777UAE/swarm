/**
 * Created by alex on 11.07.17.
 */

import 'source-map-support/register';
import * as util from 'util';
import {execFile} from 'child_process';
import {SIGKILL} from "constants";

const debug = require('debug')('miner:nvidia-smi');
const exec = util.promisify(execFile);


export class NVidia {
    constructor(private nvidiaSMIPath: string) {
    }

    // nvidia-smi --query-gpu=count --format=csv,noheader,nounits
    public async detect(): Promise<boolean> {
        const nvOpts = ['--query-gpu=count', '--format=csv,noheader,nounits'];
        try {
            debug(`executing: ${this.nvidiaSMIPath} ${nvOpts.join(' ')}`);
            const { stdout } = await exec(this.nvidiaSMIPath, nvOpts , {
                killSignal: 'SIGKILL',
                timeout: 60000
            });
            debug(`got output:\n${stdout}`);
            const lines = stdout.split('\n');
            return !(lines.length === 0 || lines[0].length === 0 || isNaN(parseInt(lines[0][0])));
        } catch (err) {
            return false;
        }
    }

    public async getIndexes(): Promise<number[]> {
        const nvOpts = ['--query-gpu=index', '--format=csv,noheader,nounits'];
        debug(`executing: ${this.nvidiaSMIPath} ${nvOpts.join(' ')}`);
        const { stdout } = await exec(this.nvidiaSMIPath, nvOpts, {
            killSignal: 'SIGKILL',
            timeout: 60000
        });
        debug(`got output:\n${stdout}`);
        const lines = stdout.split('\n');
        return lines.filter(el => el).map(el => parseInt(el));
    }
}