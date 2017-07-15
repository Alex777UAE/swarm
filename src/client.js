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
const targz = require("tar.gz");
const util = require("util");
const Table = require("cli-table2");
const redis_1 = require("./redis");
const readFile = util.promisify(fs.readFile);
const stat = util.promisify(fs.stat);
const MINERS_DIR = __dirname + '/../miners/';
class Client {
    constructor() {
        const config = JSON.parse(fs.readFileSync(__dirname + '/../config.json', { encoding: 'utf8' }));
        this.redis = new redis_1.Redis({
            host: config.redis.host,
            port: config.redis.port,
            myName: os.hostname()
        });
    }
    uploadCoin(name, path) {
        return __awaiter(this, void 0, void 0, function* () {
            const coinConfig = JSON.parse(yield readFile(path));
            yield this.redis.updateCoin(name, coinConfig);
        });
    }
    uploadMiner(name, path, minerPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const minerConfig = JSON.parse(yield readFile(path));
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
            const read = targz().createReadStream(path);
            const write = fs.createWriteStream(newArchivePath);
            read.pipe(write);
            read.on('error', reject);
            write.on('error', reject);
            write.on('finish', () => resolve(newArchivePath));
        });
    }
    setCurrentCoin(name, nodes) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redis.setCurrentCoin(name, nodes);
        });
    }
    showStats(short = true) {
        return __awaiter(this, void 0, void 0, function* () {
            const rawStats = yield this.redis.getStats();
            let stats = {};
            Object.keys(rawStats).forEach(name => {
                stats[name] = { timestamp: rawStats[name].timestamp, info: JSON.parse(rawStats[name].json) };
            });
            short ? this.briefTable(stats) : this.fullTable(stats);
        });
    }
    briefTable(stats) {
        const table = new Table({
            head: ['Hostname', 'IP', 'Coin', 'CPU', 'GPU#', 'Hashrate', 'Mining time', 'Uptime', 'Freshness sec.']
            // , colWidths: [100, 200]
        });
        Object.keys(stats).forEach(name => {
            const info = stats[name].info;
            const d = Math.round((Date.now() - stats[name].timestamp) / 1000);
            table.push([name, info.ip, info.coin, info.cpu, info.gpuN, info.hashrate, info.coinTime, info.uptime, d]);
        });
    }
    fullTable(stats) {
        const table = new Table({ style: { head: [], border: [] } });
        Object.keys(stats).forEach(name => {
            const info = stats[name].info;
            const d = Math.round((Date.now() - stats[name].timestamp) / 1000);
            table.push([
                { colSpan: 2, content: name },
                info.ip,
                info.coin,
                info.cpu,
                info.gpuN,
                info.hashrate,
                info.coinTime,
                info.uptime,
                d
            ]);
            info.gpuDetails.forEach((gpu, id) => {
                table.push([
                    id,
                    info.gpuNames[id],
                    gpu.temperature,
                    gpu.gpuLoad,
                    gpu.memLoad,
                    gpu.gpuClock,
                    gpu.memClock,
                    gpu.fanSpeed,
                    gpu.powerDraw,
                    info.gpuHashrates[id]
                ]);
            });
        });
    }
    removeDeadNode(name) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redis.removeDeadNode(name);
        });
    }
}
exports.Client = Client;
//# sourceMappingURL=client.js.map