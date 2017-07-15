/**
 * Created by alex on 11.07.17.
 */

namespace Units {
    export abstract class IUnit {
        // public abstract fromJson(json: string): T;

        public abstract toJson(): string;
    }
}