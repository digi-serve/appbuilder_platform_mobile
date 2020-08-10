/**
 * ABFieldTree
 *
 * This is the platform dependent implementation of ABFieldTree.
 *
 */

var ABFieldTreeCore = require("../../core/dataFields/ABFieldTreeCore");

module.exports = class ABFieldTree extends ABFieldTreeCore {
   constructor(attributes, object) {
      super(attributes, object);
   }
};
