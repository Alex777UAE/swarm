/**
 * Created by alex on 11.07.17.
 */

import IGPU = Units.IGPU;
import GPUModel = Units.GPUModel;
import IGPUConfig = Units.IGPUConfig;

export class AMD extends IGPU {
    protected config: IGPUConfig;
    protected cardId: number;
    protected cardUUID: string;
    protected cardModel: GPUModel;

    get id(): number {
        return this.cardId;
    }

    get uuid(): string {
        return this.cardUUID;
    }

    get model(): GPUModel {
        return this.cardModel;
    }

    public async getStats(): Promise<Units.IGPUStats> {
        return null;
    }

    public async init(id: number): Promise<void> {
        throw new Error('Not implemented');
    }

    public async setup(config: IGPUConfig): Promise<void> {
    }

    public toJson(): string {
        return JSON.stringify(this.config);
    }
}