/**
 * ABFieldConnect
 *
 * This is the platform dependent implementation of ABFieldConnect.
 *
 */

var ABFieldConnectCore = require("../../core/dataFields/ABFieldConnectCore");

module.exports = class ABFieldConnect extends ABFieldConnectCore {
   constructor(attributes, object) {
      super(attributes, object);
   }
};
