/**
 * ABFieldJSON
 *
 * This is the platform dependent implementation of ABFieldJSON.
 *
 */

var ABFieldJSONCore = require("../../core/dataFields/ABFieldJsonCore");

module.exports = class ABFieldJSON extends ABFieldJSONCore {
   constructor(attributes, object) {
      super(attributes, object);
   }
};
