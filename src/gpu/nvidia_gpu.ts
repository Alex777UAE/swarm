/**
 * Created by alex on 11.07.17.
 */

import 'source-map-support/register';
import * as fs from 'fs';
import * as touch from 'touch';
import * as util from 'util';
import {execFile} from 'child_process';
import {GPUModel, IGPUConfig, IGPUStats} from "../../interfaces/i_gpu";
import {IGPU} from "../../interfaces/i_gpu";

const debug = require('debug')('miner:nvidia-gpu');

const exec: any = util.promisify(execFile);
const writeFile: any = util.promisify(fs.writeFile);
const chmod: any = util.promisify(fs.chmod);

export class NVidiaGPU extends IGPU {
    protected config: IGPUConfig;
    protected cardId: number;
    protected cardUUID: string;
    protected cardModel: GPUModel;

    constructor(private nvidiaSMIPath: string, private nvidiaSettingsPath: string) {
        super();
    }

    get id(): number {
        return this.cardId;
    }

    get uuid(): string {
        return this.cardUUID;
    }

    get model(): GPUModel {
        return this.cardModel;
    }

    public async getStats(): Promise<IGPUStats> {
        const nvOpts = [
            '-i',
            this.id,
            '--query-gpu=utilization.gpu,utilization.memory,power.draw,temperature.gpu,fan.speed,' +
            'clocks.current.graphics,clocks.current.memory',
            '--format=csv,noheader,nounits'
        ];
        debug(`executing: ${this.nvidiaSMIPath} ${nvOpts.join(' ')}`);
        const o = await exec(this.nvidiaSMIPath, nvOpts , {killSignal: 'SIGKILL', timeout: 90000});
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
        const nvOpts = ['-i', id, '--query-gpu=name,uuid', '--format=csv,noheader,nounits'];
        debug(`executing: ${this.nvidiaSMIPath} ${nvOpts.join(' ')}`);
        const o = await exec(this.nvidiaSMIPath, nvOpts , { killSignal: 'SIGKILL', timeout: 90000});
        debug(`got output:\n${o.stdout}`);
        let [name, uuid] = o.stdout.split(',');
        this.cardUUID = uuid.trim();
        this.cardModel = name.replace('GeForce', '').replace(/\s+/g, '');
    }

    public async setup(config: IGPUConfig): Promise<void> {
        const lockFile = `/tmp/oc_${this.id}`;
        const overclockScriptPath = __dirname + '/../../scripts/overclock.sh';
        const cleanScriptPath = __dirname + '/../../scripts/clean.sh';
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
        `;
        const cleanScript = `#!/bin/bash\nrm -f ${lockFile}`;
        debug(`writing script text to a file: ${overclockScriptPath}:\n${overClockScript}`);
        await writeFile(overclockScriptPath, overClockScript);
        await chmod(overclockScriptPath, 755);
        debug(`writing script text to a file: ${cleanScriptPath}:\n${cleanScript}`);
        await writeFile(cleanScriptPath, cleanScript);
        await chmod(cleanScriptPath, 755);
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
        await exec('/usr/sbin/service', ['lightdm', 'restart'], {
            killSignal: 'SIGKILL',
            timeout: 90000
        });
        debug(`waiting lockfile to disappear`);
        await locked;
    }

    public toJson(): string {
        return JSON.stringify(this.config);
    }
}