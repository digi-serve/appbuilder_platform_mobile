/*
 * ABFieldTextFormula
 *
 * An ABFieldTextFormula defines a TextFormula field type.
 *
 */

var ABFieldTextFormulaCore = require("../../core/dataFields/ABFieldTextFormulaCore");

module.exports = class ABFieldTextFormula extends ABFieldTextFormulaCore {
    constructor(attributes, object) {
        super(attributes, object);
    }
};
