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
const util = require("util");
const child_process_1 = require("child_process");
const constants_1 = require("constants");
const debug = require('debug')('miner:nvidia-smi');
const exec = util.promisify(child_process_1.execFile);
class NVidia {
    constructor(nvidiaSMIPath) {
        this.nvidiaSMIPath = nvidiaSMIPath;
    }
    // nvidia-smi --query-gpu=count --format=csv,noheader,nounits
    detect() {
        return __awaiter(this, void 0, void 0, function* () {
            const nvOpts = ['--query-gpu=count', '--format=csv,noheader,nounits'];
            try {
                debug(`executing: ${this.nvidiaSMIPath} ${nvOpts.join(' ')}`);
                const { stdout } = yield exec(this.nvidiaSMIPath, nvOpts, {
                    killSignal: constants_1.SIGKILL,
                    timeout: 60000
                });
                debug(`got output:\n${stdout}`);
                const lines = stdout.split('\n');
                return !(lines.length === 0 || lines[0].length === 0 || isNaN(parseInt(lines[0][0])));
            }
            catch (err) {
                return false;
            }
        });
    }
    getIndexes() {
        return __awaiter(this, void 0, void 0, function* () {
            const nvOpts = ['--query-gpu=count', '--format=csv,noheader,nounits'];
            debug(`executing: ${this.nvidiaSMIPath} ${nvOpts.join(' ')}`);
            const { stdout } = yield exec(this.nvidiaSMIPath, nvOpts, {
                killSignal: constants_1.SIGKILL,
                timeout: 60000
            });
            debug(`got output:\n${stdout}`);
            const lines = stdout.split('\n');
            return lines.map(parseInt);
        });
    }
}
exports.NVidia = NVidia;
//# sourceMappingURL=nvidia.js.map