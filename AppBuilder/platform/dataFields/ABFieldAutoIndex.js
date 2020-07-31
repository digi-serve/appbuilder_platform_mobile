/**
 * ABFieldAutoIndex
 *
 * This is the platform dependent implementation of ABFieldAutoIndex.
 *
 */

var ABFieldAutoIndexCore = require("../../core/dataFields/ABFieldAutoIndexCore");

module.exports = class ABFieldAutoIndex extends ABFieldAutoIndexCore {
   constructor(attributes, object) {
      super(attributes, object);
   }
};
