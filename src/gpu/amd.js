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
const i_gpu_1 = require("../../interfaces/i_gpu");
/**
 * Created by alex on 11.07.17.
 */
class AMD extends i_gpu_1.IGPU {
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
            return null;
        });
    }
    init(id) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('Not implemented');
        });
    }
    setup(config) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    toJson() {
        return JSON.stringify(this.config);
    }
}
exports.AMD = AMD;
//# sourceMappingURL=amd.js.map