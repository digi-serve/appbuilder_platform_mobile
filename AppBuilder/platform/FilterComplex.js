const FilterComplexCore = require("../core/FilterComplexCore");
module.exports = class FilterComplex extends FilterComplexCore {
   setReducedConditions(cond) {
      this.condition = cond;
   }
};
