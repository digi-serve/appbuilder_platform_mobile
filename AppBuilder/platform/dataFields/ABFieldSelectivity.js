/**
 * ABFieldSelectivity
 *
 * This is the platform dependent implementation of ABFieldSelectivity.
 *
 */

const ABField = require("./ABField");

module.exports = class ABFieldSelectivity extends ABField {
   constructor(attributes, object) {
      super(attributes, object);
   }
};
