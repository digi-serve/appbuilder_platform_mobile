/**
 * ABViewContainer
 *
 * This is the platform dependent implementation of ABViewContainer.
 *
 */

var ABViewContainerCore = require("../../core/views/ABViewContainerCore");

module.exports = class ABViewContainer extends ABViewContainerCore {
   constructor(values, application, parent) {
      super(values, application, parent);
   }
};
