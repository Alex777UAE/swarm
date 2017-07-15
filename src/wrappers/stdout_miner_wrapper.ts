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
const util = require('util');

const VALIDATION_LOOP_INTERVAL = 5 * 60 * 1000; // once in a five minute
const MINERS_DIRECTORY_BASE = __dirname + '/../../miners/';

const debug = require('debug')('miner:StdOutMinerWrapper');
const spawn = util.promisify(childProcess.spawn);

export type parserFn = (data: string) => void;

export abstract class StdOutMinerWrapper extends IMiner {
    protected miner: ChildProcess;
    protected coin: ICoinConfig;
    protected hr: number = 0;
    protected hrTimestamp: number;
    protected hrs: {[id: number]: number} = {};
    protected hrsTimestamp: {[id: number]: number} = {};
    protected acceptPercent: number = 0;
    protected worker: string;
    protected timer: NodeJS.Timer;

    constructor(executable: string) {
        super(executable);
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

    public setWorker(name: string): void {
        this.worker = name;
    }

    public async launchMinerBinary(coin: ICoinConfig,
                                   args: string[],
                                   stoutParser: parserFn,
                                   stdErrParser?: parserFn): Promise<void> {
        this.coin = coin;
        await this.exec(this.executable, args, stoutParser, stdErrParser ? stdErrParser : StdOutMinerWrapper.errParser);
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
            this.miner.kill('SIGKILL');
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
        if (this.coin) this.start(this.coin)
            .catch(debug);
    }

    protected async exec(executable: string, args: string[], stdoutParser: parserFn, stderrParser: parserFn) {
        this.miner = await spawn(MINERS_DIRECTORY_BASE + executable, args,  {
            env: {
                GPU_MAX_ALLOC_PERCENT: 100,
                GPU_USE_SYNC_OBJECTS: 1
            }
        });
        this.miner.stdout.on('data', stdoutParser);
        this.miner.stderr.on('data', stderrParser);
        this.miner.on('close', this.handleExit.bind(this))
    }

    public toJson(): string {
        return JSON.stringify({name: this.worker, type: this.type, hr: this.hashrate, hrs: this.hashrates});
    }

    protected static errParser(data: string): void {
        debug(data);
    }
}