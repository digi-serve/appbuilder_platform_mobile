/*
 * ABFieldDateTime
 *
 * An ABFieldDateTime defines a Date & Time field type.
 *
 */
const path = require("path");
const moment = require("moment");

const ABFieldDateTimeCore = require("../../core/dataFields/ABFieldDateTimeCore.js");

module.exports = class ABFieldDateTime extends ABFieldDateTimeCore {
   constructor(values, object) {
      super(values, object);
   }

   ///
   /// Instance Methods
   ///

   // isValid() {
   //    var errors = super.isValid();

   //    return errors;
   // }
};
