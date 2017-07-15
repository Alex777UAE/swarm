"use strict";
/**
 * Created by alex on 11.07.17.
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
const fs = require("fs");
const util = require("util");
const touch = require("touch");
const child_process_1 = require("child_process");
const constants_1 = require("constants");
const i_gpu_1 = require("../../interfaces/i_gpu");
const debug = require('debug')('miner:nvidia-gpu');
const exec = util.promisify(child_process_1.execFile);
const writeFile = util.promisify(fs.writeFile);
class NVidiaGPU extends i_gpu_1.IGPU {
    constructor(nvidiaSMIPath, nvidiaSettingsPath) {
        super();
        this.nvidiaSMIPath = nvidiaSMIPath;
        this.nvidiaSettingsPath = nvidiaSettingsPath;
    }
    get id() {
        return this.cardId;
    }
    get uuid() {
        return this.cardUUID;
    }
    get model() {
        return this.cardModel;
    }
    getStats() {
        return __awaiter(this, void 0, void 0, function* () {
            const nvOpts = [
                '-i',
                this.id,
                '--query-gpu=utilization.gpu,utilization.memory,power.draw,temperature.gpu,fan.speed,' +
                    'clocks.current.graphics,clocks.current.memory',
                '--format=csv,noheader,nounits'
            ];
            debug(`executing: ${this.nvidiaSMIPath} ${nvOpts.join(' ')}`);
            const o = yield exec(this.nvidiaSMIPath, nvOpts, { killSignal: 'SIGKILL', timeout: 90000 });
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
            };
        });
    }
    init(id) {
        return __awaiter(this, void 0, void 0, function* () {
            this.cardId = id;
            const nvOpts = ['-i', id, '--query-gpu=name,uuid', '--format=csv,noheader,nounits'];
            debug(`executing: ${this.nvidiaSMIPath} ${nvOpts.join(' ')}`);
            const o = yield exec(this.nvidiaSMIPath, nvOpts, { killSignal: 'SIGKILL', timeout: 90000 });
            debug(`got output:\n${o.stdout}`);
            let [name, uuid] = o.stdout.split(',');
            this.cardUUID = uuid.trim();
            this.cardModel = name.replace('GeForce', '').replace(/\s+/g, '');
        });
    }
    setup(config) {
        return __awaiter(this, void 0, void 0, function* () {
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
            yield writeFile(scriptPath, overClockScript);
            debug(`locking with ${lockFile}`);
            yield touch(lockFile);
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
            yield exec('/sbin/service lightdm restart', [], {
                killSignal: constants_1.SIGKILL,
                timeout: 90000
            });
            debug(`waiting lockfile to disappear`);
            yield locked;
        });
    }
    toJson() {
        return JSON.stringify(this.config);
    }
}
exports.NVidiaGPU = NVidiaGPU;
//# sourceMappingURL=nvidia_gpu.js.map