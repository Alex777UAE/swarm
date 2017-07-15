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
const os = require("os");
const fs = require("fs");
const util = require("util");
const targz = require("tar.gz");
const nvidia_1 = require("../nvidia");
const nvidia_gpu_1 = require("../gpu/nvidia_gpu");
const i_rig_1 = require("../../interfaces/i_rig");
const writeFile = util.promisify(fs.writeFile);
const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);
const CONFIG_COINS_PATH = __dirname + '/../../configs/coins/';
const CONFIG_MINERS_PATH = __dirname + '/../../configs/miners/';
const MINERS_PATH = __dirname + '/../../miners/';
const LIGHT_DM_CONFIG_PATH = '/etc/lightdm/lightdm.conf';
class Linux extends i_rig_1.IRig {
    constructor(nvidiaSMIPath, nvidiaSettingsPath) {
        super();
        this.nvidiaSMIPath = nvidiaSMIPath;
        this.nvidiaSettingsPath = nvidiaSettingsPath;
        this.gpus = [];
        this.nv = new nvidia_1.NVidia(nvidiaSMIPath);
    }
    get os() {
        return 'linux';
    }
    get hostname() {
        return os.hostname();
    }
    get cpu() {
        return os.cpus()[0].model;
    }
    get uptime() {
        return os.uptime();
    }
    get ip() {
        const ifaces = os.networkInterfaces();
        const ifaceNames = Object.keys(ifaces).filter(key => key[1] !== 'l' || key[2] !== 'o');
        for (let i = 0; i < ifaceNames.length; i++) {
            const ifaceName = ifaceNames[i];
            for (let j = 0; j < ifaces[ifaceName].length; j++) {
                const ifaceDescription = ifaces[ifaceName][j];
                if (ifaceDescription.family === 'IPv4' && ifaceDescription.address)
                    return ifaceDescription.address;
            }
        }
        throw new Error('No IP configured?');
    }
    getGPUs() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.gpus;
        });
    }
    getLoad() {
        return __awaiter(this, void 0, void 0, function* () {
            const cpuNum = os.cpus().length;
            const loadAvg = os.loadavg()[0];
            const osTotalMem = os.totalmem();
            const osFreeMem = os.freemem();
            return { cpu: Math.round(loadAvg / cpuNum), mem: Math.round(osFreeMem * 100 / osTotalMem) };
        });
    }
    /*
     should initialize os data, all cards
     set some params, like sysctl etc
     todo multi-GPU support
     */
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(yield this.nv.detect()))
                throw new Error('No GPU found!');
            const indexes = yield this.nv.getIndexes();
            for (let i = 0; i < indexes.length; i++) {
                const idx = indexes[i];
                const nv = new nvidia_gpu_1.NVidiaGPU(this.nvidiaSMIPath, this.nvidiaSettingsPath);
                yield nv.init(idx);
                this.gpus.push(nv);
            }
            yield Linux.installLightDMConfig();
        });
    }
    toJson() {
        return JSON.stringify({
            ip: this.ip,
            os: this.os
        });
    }
    static installLightDMConfig() {
        return __awaiter(this, void 0, void 0, function* () {
            const lightDMConfText = yield readFile(__dirname + '/../templates/static/lightdm.conf');
            lightDMConfText.replace('${dirname}', __dirname + '/../scripts');
            yield writeFile(LIGHT_DM_CONFIG_PATH, lightDMConfText);
        });
    }
    updateCoin(name, config) {
        return __awaiter(this, void 0, void 0, function* () {
            yield writeFile(CONFIG_COINS_PATH + name, JSON.stringify(config));
        });
    }
    updateMiner(name, config, bin) {
        return __awaiter(this, void 0, void 0, function* () {
            yield writeFile(CONFIG_COINS_PATH + name, JSON.stringify(config));
            if (config.fileType === 'binary') {
                yield writeFile(MINERS_PATH + name, bin);
            }
            else if (config.fileType === 'tgz') {
                yield this.untgzBuffer(bin);
            }
        });
    }
    untgzBuffer(bin) {
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(bin);
            const writeStream = targz().createWriteStream(MINERS_PATH);
            readStream.pipe(writeStream);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            readStream.on('error', reject);
        });
    }
    loadMiners() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Linux.loadJSONFiles(CONFIG_MINERS_PATH);
        });
    }
    loadCoins() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Linux.loadJSONFiles(CONFIG_COINS_PATH);
        });
    }
    static loadJSONFiles(dir) {
        return __awaiter(this, void 0, void 0, function* () {
            const list = {};
            const files = yield readdir(dir);
            for (let i = 0; i < files.length; i++) {
                const name = files[i];
                list[name] = JSON.parse(yield readFile(dir + name));
            }
            return list;
        });
    }
}
exports.Linux = Linux;
//# sourceMappingURL=linux.js.map