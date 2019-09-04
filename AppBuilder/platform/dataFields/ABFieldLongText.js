/**
 * ABFieldLongText
 *
 * This is the platform dependent implementation of ABFieldLongText.
 *
 */

var ABFieldLongTextCore = require("../../core/dataFields/ABFieldLongTextCore");

module.exports = class ABFieldLongText extends ABFieldLongTextCore {
    constructor(attributes, object) {
        super(attributes, object);
    }
};
