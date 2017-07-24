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
/**
 * Created by alex on 13.07.17.
 */
require("source-map-support/register");
const childProcess = require("child_process");
const Bluebird = require("bluebird");
const timers_1 = require("timers");
const i_miner_1 = require("../../interfaces/i_miner");
const path = require("path");
const util = require('util');
const VALIDATION_LOOP_INTERVAL = 5 * 60 * 1000; // once in a five minute
const MINERS_DIRECTORY_BASE = __dirname + '/../../miners/';
const debug = require('debug')('miner:StdOutMinerWrapper');
class StdOutMinerWrapper extends i_miner_1.IMiner {
    constructor(name, executable) {
        super(name, executable);
        this.hr = 0;
        this.hrs = {};
        this.hrsTimestamp = {};
        this.acceptPercent = 0;
        this.noTimestampCounter = 0;
    }
    get hashrate() {
        return this.hr;
    }
    get acceptedPercent() {
        return this.acceptPercent;
    }
    get hashrates() {
        return Object.keys(this.hrs).map(id => this.hrs[id]);
    }
    get startTime() {
        return this.started;
    }
    setWorker(name) {
        this.worker = name;
    }
    launchMinerBinary(coin, args, stoutParser, stdErrParser) {
        return __awaiter(this, void 0, void 0, function* () {
            this.coin = coin;
            debug(`Executing ${this.executable} with ${args.join(' ')}`);
            yield this.exec(args, stoutParser, stdErrParser ? stdErrParser : StdOutMinerWrapper.errParser);
            this.started = Date.now();
            debug(`Miner started at ${this.started}`);
            debug(`Starting validation loop`);
            this.validityLoop();
        });
    }
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.timer) {
                clearTimeout(this.timer);
            }
            if (this.miner) {
                this.coin = undefined;
                this.miner.kill('SIGTERM');
                yield Bluebird.delay(3000);
                if (this.miner)
                    this.miner.kill('SIGKILL');
                this.miner = undefined;
            }
        });
    }
    validityLoop() {
        const now = Date.now();
        debug(`validating at ${now}`);
        if (!this.hrTimestamp || now - this.hrTimestamp >= VALIDATION_LOOP_INTERVAL)
            this.hr = 0;
        if (!this.hrsTimestamp)
            this.noTimestampCounter++;
        else
            this.noTimestampCounter = 0;
        Object.keys(this.hrsTimestamp).forEach(gpuId => {
            if (Date.now() - this.hrsTimestamp[gpuId] >= VALIDATION_LOOP_INTERVAL)
                this.hrs[gpuId] = 0;
        });
        if (this.noTimestampCounter > 1 || this.hrTimestamp && now - this.hrTimestamp >= VALIDATION_LOOP_INTERVAL * 2) {
            debug('too much of inactivity, restarting process');
            this.handleExit(666);
        }
        else {
            debug('Setting up next loop');
            this.timer = timers_1.setTimeout(this.validityLoop.bind(this), VALIDATION_LOOP_INTERVAL);
        }
    }
    setTotalHashrate(rate) {
        this.hr = rate;
        this.hrTimestamp = Date.now();
    }
    setGPUHashrate(gpuId, rate) {
        this.hrs[gpuId] = rate;
        this.hrsTimestamp[gpuId] = Date.now();
    }
    handleExit(code) {
        debug(`exit code ${code}`);
        const coin = this.coin;
        if (this.coin)
            this.stop()
                .then(() => Bluebird.delay(15000))
                .then(() => {
                if (!this.miner)
                    return this.start(coin);
            })
                .catch(debug);
    }
    exec(args, stdoutParser, stderrParser) {
        return __awaiter(this, void 0, void 0, function* () {
            this.miner = childProcess.spawn(MINERS_DIRECTORY_BASE + this.name + path.sep + this.executable, args);
            this.miner.stdout.on('data', data => {
                data = data.toString();
                stdoutParser(data);
            });
            this.miner.stderr.on('data', data => {
                data = data.toString();
                stderrParser(data);
            });
            this.miner.on('close', this.handleExit.bind(this));
            this.miner.on('error', StdOutMinerWrapper.errParser); // todo handle it properly
        });
    }
    toJson() {
        return JSON.stringify({ name: this.worker, type: this.type, hr: this.hashrate, hrs: this.hashrates });
    }
    static errParser(data) {
        debug(data.toString());
    }
}
exports.StdOutMinerWrapper = StdOutMinerWrapper;
//# sourceMappingURL=stdout_miner_wrapper.js.map