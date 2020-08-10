/**
 * ABFieldString
 *
 * This is the platform dependent implementation of ABFieldString.
 *
 */

var ABFieldStringCore = require("../../core/dataFields/ABFieldStringCore");

module.exports = class ABFieldString extends ABFieldStringCore {
   constructor(attributes, object) {
      super(attributes, object);
   }
};
