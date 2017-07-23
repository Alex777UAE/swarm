/**
 * Created by alex on 13.07.17.
 */
import 'source-map-support/register';
import * as childProcess from "child_process";
import * as Bluebird from 'bluebird';
import {ChildProcess} from "child_process";
import {SIGTERM} from "constants";
import {setTimeout} from "timers";
import {ICoinConfig} from "../../interfaces/i_coin";
import {IMiner} from "../../interfaces/i_miner";
import * as path from "path";
const util = require('util');

const VALIDATION_LOOP_INTERVAL = 5 * 60 * 1000; // once in a five minute
const MINERS_DIRECTORY_BASE = __dirname + '/../../miners/';

const debug = require('debug')('miner:StdOutMinerWrapper');

export type parserFn = (data: string) => void;

export abstract class StdOutMinerWrapper extends IMiner {
    protected miner: ChildProcess;
    protected coin: ICoinConfig;
    protected hr: number = 0;
    protected hrTimestamp: number;
    protected hrs: { [id: number]: number } = {};
    protected hrsTimestamp: { [id: number]: number } = {};
    protected acceptPercent: number = 0;
    protected worker: string;
    protected timer: NodeJS.Timer;
    protected started: number;

    constructor(name: string, executable: string) {
        super(name, executable);
    }

    public get hashrate(): number {
        return this.hr;
    }

    public get acceptedPercent(): number {
        return this.acceptPercent;
    }

    public get hashrates(): number[] {
        return Object.keys(this.hrs).map(id => this.hrs[id]);
    }

    public get startTime(): number {
        return this.started;
    }


    public setWorker(name: string): void {
        this.worker = name;
    }

    public async launchMinerBinary(coin: ICoinConfig,
                                   args: string[],
                                   stoutParser: parserFn,
                                   stdErrParser?: parserFn): Promise<void> {
        this.coin = coin;
        debug(`Executing ${this.executable} with ${args.join(' ')}`);
        await this.exec(args, stoutParser, stdErrParser ? stdErrParser : StdOutMinerWrapper.errParser);
        this.started = Date.now();
        debug(`Miner started at ${this.started}`);
        debug(`Starting validation loop`);
        this.validityLoop();
    }

    public async stop(): Promise<void> {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        if (this.miner) {
            this.coin = undefined;
            this.miner.kill('SIGTERM');
            await Bluebird.delay(3000);
            if (this.miner) this.miner.kill('SIGKILL');
            this.miner = undefined;
        }
    }

    protected validityLoop(): void {
        if (!this.hrTimestamp || Date.now() - this.hrTimestamp > VALIDATION_LOOP_INTERVAL) this.hr = 0;

        Object.keys(this.hrsTimestamp).forEach(gpuId => {
            if (Date.now() - this.hrsTimestamp[gpuId] > VALIDATION_LOOP_INTERVAL)
                this.hrsTimestamp[gpuId] = 0;
        });
        this.timer = setTimeout(this.validityLoop.bind(this), VALIDATION_LOOP_INTERVAL)
    }

    protected setTotalHashrate(rate: number): void {
        this.hr = rate;
        this.hrTimestamp = Date.now();
    }

    protected setGPUHashrate(gpuId: number, rate: number): void {
        this.hrs[gpuId] = rate;
        this.hrsTimestamp[gpuId] = Date.now();
    }

    protected handleExit(code: number): void {
        // todo notify switching algo module somehow?
        debug(`exit code ${code}`);
        const coin = this.coin;
        if (this.coin)
            this.stop()
                .then(() => Bluebird.delay(15000))
                .then(() => {
                    if (!this.miner) return this.start(coin)
                })
                .catch(debug);
    }

    protected async exec(args: string[], stdoutParser: parserFn, stderrParser: parserFn) {
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
        this.miner.on('error', StdOutMinerWrapper.errParser) // todo handle it properly
    }

    public toJson(): string {
        return JSON.stringify({name: this.worker, type: this.type, hr: this.hashrate, hrs: this.hashrates});
    }

    protected static errParser(data: string | Buffer): void {
        debug(data.toString());
    }
}