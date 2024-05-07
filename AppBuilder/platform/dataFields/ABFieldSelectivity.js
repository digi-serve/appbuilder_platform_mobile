const ABField = require("./ABField");
module.exports = class ABFieldSelectivity extends ABField {
   static defaults() {
      return { key: "selectivity" };
   }
};
