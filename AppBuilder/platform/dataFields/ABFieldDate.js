/**
 * ABFieldDate
 *
 * This is the platform dependent implementation of ABFieldBoolean.
 *
 */

var ABFieldDateCore = require("../../core/dataFields/ABFieldDateCore");

module.exports = class ABFieldDate extends ABFieldDateCore {
   constructor(attributes, object) {
      super(attributes, object);
   }
};
