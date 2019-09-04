/**
 * ABApplication
 *
 * This is the platform dependent implementation of ABApplication.
 *
 */

// var ABApplicationBase = require(path.join(__dirname,  "..", "..", "assets", "opstools", "AppBuilder", "classes",  "ABApplicationBase.js"));
var ABApplicationCore = require("../core/ABApplicationCore");
var ABDataCollectionCore = require("../core/ABDataCollectionCore");
var ABObjectCore = require("../core/ABObjectCore");
var moment = require("moment");
var uuidv4 = require("uuid/v4");

module.exports = class ABApplication extends ABApplicationCore {
    constructor(attributes) {
        super(attributes);
    }

    findDC(id) {
        return this.datacollections((d) => {
            return d.id == id;
        })[0];
    }

    cloneDeep(obj) {
        // lodash is available on the platform
        return _.cloneDeep(obj);
    }

    languageDefault() {
        var lang = navigator.language || "en";
        if (lang.indexOf("en-") != -1) lang = "en";
        if (lang.indexOf("zh-") != -1) lang = "zh-hans"; // show one version of Chinese for all
        if (lang.indexOf("ko-") != -1) lang = "zh-hans"; // show Chinese instead of Korean
        return lang;
    }

    uuid() {
        return uuidv4();
    }

    createdAt(date) {
        return this.sqlDateTime(date);
    }

    updatedAt(date) {
        return this.sqlDateTime(date);
    }

    sqlDateTime(date) {
        // taken from app_builder/api/services/AppBuilder.rules.toSQLDateTime()
        return moment(date).format("YYYY-MM-DD HH:mm:ss");
    }
};
