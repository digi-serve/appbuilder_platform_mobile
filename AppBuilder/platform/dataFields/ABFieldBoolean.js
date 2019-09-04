/**
 * ABFieldBoolean
 *
 * This is the platform dependent implementation of ABFieldBoolean.
 *
 */

var ABFieldBooleanCore = require("../../core/dataFields/ABFieldBooleanCore");

module.exports = class ABFieldBoolean extends ABFieldBooleanCore {
    constructor(attributes, object) {
        super(attributes, object);
    }
};
