/**
 * Created by alex on 11.07.17.
 */
var Units;
(function (Units) {
    class IMiner extends Units.IUnit {
        constructor(executable) {
            super();
            this.executable = executable;
        }
    }
    Units.IMiner = IMiner;
})(Units || (Units = {}));
//# sourceMappingURL=i_miner.js.map