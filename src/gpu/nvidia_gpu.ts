/**
 * Created by alex on 11.07.17.
 */

import * as fs from 'fs';
import * as util from 'util';
import * as touch from 'touch';
import {execFile} from 'child_process';
import {SIGKILL} from "constants";

const debug = require('debug')('miner:nvidia-gpu');

const exec = util.promisify(execFile);
const writeFile = util.promisify(fs.writeFile);

export class NVidiaGPU extends Units.IGPU {
    protected config: Units.IGPUConfig;
    protected cardId: number;
    protected cardUUID: string;
    protected cardModel: Units.GPUModel;

    constructor(private nvidiaSMIPath: string, private nvidiaSettingsPath: string) {
        super();
    }

    get id(): number {
        return this.cardId;
    }

    get uuid(): string {
        return this.cardUUID;
    }

    get model(): Units.GPUModel {
        return this.cardModel;
    }

    public async getStats(): Promise<Units.IGPUStats> {
        const nvOpts = [
            `-i ${this.id}`,
            '--query-gpu=utilization.gpu,utilization.memory,power.draw,temperature.gpu,fan.speed,' +
            'clocks.current.graphics,clocks.current.memory',
            '--format=csv,noheader,nounits'
        ];
        debug(`executing: ${this.nvidiaSMIPath} ${nvOpts.join(' ')}`);
        const o = await exec(this.nvidiaSMIPath, nvOpts , {killSignal: SIGKILL, timeout: 90000});
        debug(`got output:\n${o.stdout}`);
        const stats = o.stdout.split(',').map(e => parseFloat(e));
        return {
            gpuLoad: stats[0],
            memLoad: stats[1],
            powerDraw: stats[2],
            temperature: stats[3],
            fanSpeed: stats[4],
            gpuClock: stats[5],
            memClock: stats[6]
        }
    }

    public async init(id: number): Promise<void> {
        this.cardId = id;
        const nvOpts = [`-i ${id}`, '--query-gpu=name,uuid', '--format=csv,noheader,nounits'];
        debug(`executing: ${this.nvidiaSMIPath} ${nvOpts.join(' ')}`);
        const o = await exec(this.nvidiaSMIPath, nvOpts , { killSignal: SIGKILL, timeout: 90000});
        debug(`got output:\n${o.stdout}`);
        let [name, uuid] = o.stdout.split(',');
        this.cardUUID = uuid.trim();
        this.cardModel = name.replace('GeForce', '').replace(/\s+/g, '');
    }

    public async setup(config: Units.IGPUConfig): Promise<void> {
        const lockFile = `/tmp/oc_${this.id}`;
        const scriptPath = __dirname + '/../../scripts/overclock.sh';
        this.config = config;
        let overClockScript = '#!/bin/bash';
        overClockScript += `
            ${this.nvidiaSMIPath} -i ${this.id} -pm 1
            ${this.nvidiaSMIPath} -i ${this.id} --compute-mode=1
            ${this.nvidiaSMIPath} -i ${this.id} -pl ${config.powerLimit}
            ${this.nvidiaSettingsPath} -a [gpu:${this.id}]/GPUPowerMizerMode=1
            ${this.nvidiaSettingsPath} -a [gpu:${this.id}]/GPUFanControlState=1
            ${this.nvidiaSettingsPath} -a [fan:${this.id}]/GPUTargetFanSpeed=${config.fanSpeedTarget}
            ${this.nvidiaSettingsPath} -a [gpu:${this.id}]/GPUGraphicsClockOffset[3]=${config.gpuClockOffset}
            ${this.nvidiaSettingsPath} -a [gpu:${this.id}]/GPUMemoryTransferRateOffset[3]=${config.memClockOffset}
            
            /usr/sbin/service lightdm stop
            rm -f ${lockFile}
        `;
        debug(`writing script text to a file: ${scriptPath}:\n${overClockScript}`);
        await writeFile(scriptPath, overClockScript);
        debug(`locking with ${lockFile}`);
        await touch(lockFile);
        const locked = new Promise((resolve, reject) => {
            const watcher = fs.watch(lockFile, 'utf8', (event) => {
                if (event === 'rename') {
                    debug(`lock file ${lockFile} removed, finishing up`);
                    watcher.close();
                    resolve();
                }
            });
            watcher.on('error', reject);
        });
        debug(`restarting ligthdm`);
        await exec('/sbin/service lightdm restart', [], {
            killSignal: SIGKILL,
            timeout: 90000
        });
        debug(`waiting lockfile to disappear`);
        await locked;
    }

    public toJson(): string {
        return JSON.stringify(this.config);
    }
}