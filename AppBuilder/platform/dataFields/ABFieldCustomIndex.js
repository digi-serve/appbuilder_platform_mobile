/**
 * ABFieldCustomIndex
 *
 * This is the platform dependent implementation of ABFieldCustomIndex.
 *
 */

var ABFieldCustomIndexCore = require("../../core/dataFields/ABFieldCustomIndexCore");

module.exports = class ABFieldCustomIndex extends ABFieldCustomIndexCore {
   constructor(attributes, object) {
      super(attributes, object);
   }
};
