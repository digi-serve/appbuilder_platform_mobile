/**
 * ABApplication
 *
 * This is the platform dependent implementation of ABApplication.
 *
 */

// var ABApplicationBase = require(path.join(__dirname,  "..", "..", "assets", "opstools", "AppBuilder", "classes",  "ABApplicationBase.js"));
var ABApplicationCore = require("../core/ABApplicationCore");
let ABDataCollection = require("./ABDataCollection");
let ABObject = require("./ABObject");
let ABObjectQuery = require("./ABObjectQuery");

var ABDefinition = require("./ABDefinition");

var ABQLManager = require("./qlOld/ABQLManager");

var moment = require("moment");
var uuidv4 = require("uuid/v4");

var __AllObjects = {
   /* ABObject.id : ABObject */
};
// {obj} : a hash of all ABObjects in our system.

var __AllQueries = {
   /* ABQuery.id : ABObjectQuery */
};
// {obj} : a hash of all ABObjectQueriess in our system.

var __AllDatacollections = {
   /* ABDatacollection.id : ABDataCollection */
};
// {obj} : a hash of all ABDataCollection in our system.

module.exports = class ABApplication extends ABApplicationCore {
   constructor(attributes) {
      super(attributes);
   }

   definitionForID(id) {
      return ABDefinition.definition(id);
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

   objectsAll() {
      return ABDefinition.allObjects().map((d) => {
         return __AllObjects[d.id] ? __AllObjects[d.id] : this.objectNew(d);
      });
   }

   /**
    * @method objectNew()
    *
    * return an instance of a new (unsaved) ABObject that is tied to this
    * ABApplication.
    *
    * NOTE: this new object is not included in our this.objects until a .save()
    * is performed on the object.
    *
    * @return {ABObject}
    */
   objectNew(values) {
      var obj = super.objectNew(values);
      obj.on("destroyed", () => {
         delete __AllObjects[obj.id];
      });
      __AllObjects[obj.id] = obj;
      return obj;
   }

   ///
   /// Queries
   ///

   queriesAll() {
      return ABDefinition.allQueries().map((d) => {
         return __AllQueries[d.id] ? __AllQueries[d.id] : this.queryNew(d);
      });
   }

   /**
    * @method queryNew()
    *
    * return an instance of a new (unsaved) ABObjectQuery that is tied to this
    * ABApplication.
    *
    * NOTE: this new object is not included in our this.objects until a .save()
    * is performed on the object.
    *
    * @return {ABObjectQuery}
    */
   queryNew(values) {
      var query = new ABObjectQuery(values, this);
      query.on("destroyed", () => {
         delete __AllQueries[query.id];
      });
      __AllQueries[query.id] = query;
      return query;
   }

   ////
   //// DataCollections
   ////

   datacollectionsAll() {
      return ABDefinition.allDatacollections().map((d) => {
         return __AllDatacollections[d.id]
            ? __AllDatacollections[d.id]
            : this.datacollectionNew(d);
      });
   }

   datacollectionNew(values) {
      var dc = new ABDataCollection(values, this);
      dc.on("destroyed", () => {
         delete __AllDatacollections[dc.id];
      });
      __AllDatacollections[dc.id] = dc;
      return dc;
   }

   ///
   /// Processes
   ///

   /**
    * @method processNew(id)
    *
    * return an instance of a new ABProcess that is tied to this
    * ABApplication.
    *
    * NOTE: this new app is not included in our this.mobileApp until a .save()
    * is performed on the App.
    *
    * @return {ABMobileApp}
    */
   processNew(id) {
      // var processDef = ABDefinition.definition(id);
      // if (processDef) {
      //    return new ABProcess(processDef, this);
      // }
      return null;
   }

   updatedAt(date) {
      return this.sqlDateTime(date);
   }

   sqlDateTime(date) {
      // taken from app_builder/api/services/AppBuilder.rules.toSQLDateTime()
      return moment(date).format("YYYY-MM-DD HH:mm:ss");
   }

   qlopNew(values, application, parent) {
      return ABQLManager.newOP(values, application || this, parent);
   }
};
