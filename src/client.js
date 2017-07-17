#!/usr/bin/env node
"use strict";
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
const os = require("os");
const TarGz = require("tar.gz");
const Table = require("cli-table2");
const colors = require("colors");
const moment = require("moment");
const util = require("util");
const redis_1 = require("./redis");
const node_1 = require("./node");
const path = require("path");
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const stat = util.promisify(fs.stat);
const MINERS_DIR = __dirname + '/../miners/';
class Client {
    constructor() {
        const config = JSON.parse(fs.readFileSync(__dirname + '/../config.json', { encoding: 'utf8' }));
        this.config = config;
        this.redis = new redis_1.Redis({
            host: config.redis.host,
            port: config.redis.port,
            myName: os.hostname(),
            onCommand: () => { } // to allow subscriber mode
        });
    }
    uploadCoin(name, path) {
        return __awaiter(this, void 0, void 0, function* () {
            const coinConfig = JSON.parse(yield readFile(path, { encoding: 'utf8' }));
            yield this.redis.updateCoin(name, coinConfig);
        });
    }
    uploadGPU(name, path) {
        return __awaiter(this, void 0, void 0, function* () {
            const gpuConfig = JSON.parse(yield readFile(path, { encoding: 'utf8' }));
            yield this.redis.updateGPU(name, gpuConfig);
        });
    }
    uploadMiner(name, path, minerPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const minerConfig = JSON.parse(yield readFile(path, { encoding: 'utf8' }));
            if (minerPath) {
                const fsStat = yield stat(minerPath);
                if (fsStat.isDirectory()) {
                    const binaryPath = yield this.targzDirectory(name, minerPath);
                    minerConfig.fileType = 'tgz';
                    yield this.redis.updateMiner(name, minerConfig, binaryPath);
                }
                else if (fsStat.isFile()) {
                    minerConfig.fileType = 'binary';
                    yield this.redis.updateMiner(name, minerConfig, minerPath);
                }
                else {
                    throw new Error(`unsupported minerPath type: not a file or directory`);
                }
            }
            else {
                yield this.redis.updateMiner(name, minerConfig);
            }
        });
    }
    targzDirectory(name, path) {
        const newArchivePath = MINERS_DIR + name + '.tar.gz';
        return new Promise((resolve, reject) => {
            const targz = new TarGz({}, { fromBase: true });
            const read = targz.createReadStream(path);
            const write = fs.createWriteStream(newArchivePath);
            read.pipe(write);
            read.on('error', reject);
            write.on('error', reject);
            write.on('finish', () => resolve(newArchivePath));
        });
    }
    setCurrentCoin(name, nodes) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!name)
                name = this.config.defaultCoin;
            if (this.config.mode === 'swarm')
                yield this.redis.setCurrentCoin(name, nodes);
            else
                yield writeFile(os.tmpdir() + path.sep + node_1.SWITCH_FILE, name, 'utf8');
        });
    }
    showStats(full = true, hostname) {
        return __awaiter(this, void 0, void 0, function* () {
            const rawStats = yield this.redis.getStats();
            let stats = {};
            Object.keys(rawStats).forEach(name => {
                if (hostname && hostname !== name)
                    return;
                stats[name] = { timestamp: rawStats[name].timestamp, info: JSON.parse(rawStats[name].json) };
                stats[name].info.coinTime = moment.duration(stats[name].info.coinTime).humanize();
                stats[name].info.uptime = moment.duration(stats[name].info.uptime * 1000).humanize();
            });
            !full ? this.briefTable(stats) : this.fullTable(stats);
            console.log(`Total GPUs: ${Object.keys(stats).reduce((total, n) => total + stats[n].info.gpuN, 0)}`);
        });
    }
    briefTable(stats) {
        const table = new Table({
            head: [
                'Hostname',
                'IP',
                'Coin',
                'CPU',
                'GPU#',
                'Hashrate',
                'Accept %',
                'Mining time',
                'Uptime',
                'Freshness sec.'
            ],
            colWidths: [21, 17, 6, 32, 15]
        });
        Object.keys(stats).forEach(name => {
            const info = stats[name].info;
            const d = Math.round((Date.now() - stats[name].timestamp) / 1000);
            table.push([
                name,
                info.ip,
                info.coin,
                info.cpu,
                info.gpuN,
                info.hashrate,
                info.acceptPercent.toFixed(4),
                info.coinTime,
                info.uptime,
                d > 120 ? colors.red(d.toString()) : d
            ]);
        });
        console.log(table.toString());
    }
    fullTable(stats) {
        const table = new Table({
            head: [
                'Hostname',
                'IP',
                'Coin',
                'CPU',
                'GPU Total',
                'Hashrate',
                'Accept %',
                'Mining time',
                'Uptime',
                'Freshness sec.'
            ],
            colWidths: [21, 17, 6, 32, 15]
        });
        Object.keys(stats).forEach(name => {
            const info = stats[name].info;
            const d = Math.round((Date.now() - stats[name].timestamp) / 1000);
            table.push([
                name,
                info.ip,
                info.coin,
                info.cpu,
                info.gpuN,
                info.hashrate,
                info.acceptPercent.toFixed(2),
                info.coinTime,
                info.uptime,
                d > 120 ? colors.red(d.toString()) : d
            ].map(rig => colors.bold(rig.toString())));
            table.push([
                'GPU#',
                'Model',
                'Temp',
                'GPU Load %',
                'Mem IO Load %',
                'Hashrate',
                'GPU Clocks',
                'Mem Clocks',
                'Fan speed',
                'Wh'
            ].map(head => colors.green(head)));
            info.gpuDetails.forEach((gpu, id) => {
                table.push([
                    id,
                    info.gpuNames[id],
                    gpu.temperature,
                    gpu.gpuLoad,
                    gpu.memLoad,
                    info.gpuHashrates[id],
                    gpu.gpuClock,
                    gpu.memClock,
                    gpu.fanSpeed,
                    gpu.powerDraw
                ]);
            });
        });
        console.log(table.toString());
    }
    removeDeadNode(name) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redis.removeDeadNode(name);
        });
    }
    command(name, params = '', hostname = '') {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redis.command(name, params, hostname);
        });
    }
}
exports.Client = Client;
//# sourceMappingURL=client.js.map