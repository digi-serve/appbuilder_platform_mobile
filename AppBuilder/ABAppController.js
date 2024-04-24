/**
 * @class ABMobileApp
 *
 * Is responsible for managing all the routes/data/templates for a given
 * application shown under an appPage.
 *
 * Is an EventEmitter.
 */
"use strict";
import EventEmitter2 from "eventemitter2";

export default class ABAppController extends EventEmitter2 {
   /**
    * @param {Object} [routes]
    */
   constructor(routes) {
      super({
         wildcard: true,
      });
      this.appPage = null;
      this.routes = routes;
      this._status = "constructor";
      this.datacollections = []; //this.application.datacollectionsIncluded();
      // keep track of which datacollections we are managing.
      // will try to initialize these when the App initializes (init()).
      this.initTimeout = 25 * 1000;
   }

   /**
    * init()
    * An App is fully initialized once all it's datacollections are
    * loaded with data.  Then this app can be displayed.
    *
    * During the initialization process, this Application emits
    * several "status" values:
    *      "platform.init"     verifying platform data stores ready
    *      "loading"           loading datacollection data
    *      "ready"             ready for operation.
    *
    * @param {AppPage} appPage
    *        the live instance of the Application Page Controller that
    *        displays this application.
    * @param {Array<String>} dcIDs
    * @return {Promise}
    */
   async init(appPage, dcIDs) {
      // save a reference to the lib/platform/pages/appPage/appPage.js object.
      this.appPage = appPage;
      this.application = this.appPage.application;
      if (dcIDs?.length > 0)
         this.datacollections =
            this.appPage.application.datacollectionsIncluded((dc) => {
               return dcIDs.indexOf(dc.id) > -1 || dcIDs.indexOf(dc.name) > -1;
            });

      // Emit a message if init doesn't complete within 25 seconds
      const initTimeout = setTimeout(() => {
         this.appPage.AB.analytics.log(
            "ABApplication timed out during init(): " +
               this.appPage.application.id,
         );
      }, this.initTimeout);

      return new Promise((resolve, reject) => {
         this.status = "init";

         // make sure each of our Datacollections have loaded their data:
         const allInits = [];
         this.datacollections.forEach((dc) => {
            if (dc) {
               dc.init();
               allInits.push(dc.platformInit());
            } else {
               console.error("Could not find data collection for key:" + dc);
            }
         });

         Promise.all(allInits)
            .then(() => {
               // make sure our site user data has been properly
               // loaded. (1st load this needs to come from server call)
               if (
                  this.appPage.AB.account.authToken == null &&
                  this.appPage.AB.account.username == null
               )
                  throw new Error("Not found authToken and username.");
               this.status = "loading";

               const allLoads = [];
               this.datacollections.forEach((dc) => {
                  if (dc) {
                     if (
                        dc.settings?.populate === "0" ||
                        dc.settings?.populate === false
                     ) {
                        dc.settings.preventPopulate = "1";
                     }
                     allLoads.push(dc.loadData());
                  }
               });

               return Promise.all(allLoads);
            })
            .then(() => {
               this.status = "ready";
               // NOTE: the setter for .status emits it's value:

               clearTimeout(initTimeout);
               resolve();
            })
            .catch((err) => {
               reject(err);
            });
      });
   }

   /**
    * isReady
    * is our data ready to work with?
    * @return {bool}
    */
   isReady() {
      return this.status == "ready";
   }

   /**
    * status
    * register our current application status state.
    * @return {String}
    */

   get status() {
      return this._status;
   }

   /**
    * status
    * register our current application status state.
    * @param {String} newStatus
    */
   set status(newStatus) {
      this._status = newStatus;
      this.emit("status", newStatus);
   }

   /**
    * clearSystemData
    * this method will clear the local storage of data, that is primarialy
    * server/system centric.  We do this before we do a reset to refresh our
    * data from the Server.
    */
   clearSystemData() {
      return Promise.resolve();
   }

   /**
    * dataCollection()
    * return the ABDataCollection referenced by the given key
    * @param {string} key the .name of the DataColleciton to return
    * @return {ABDataCollection}
    */
   dataCollection(key) {
      return this.datacollections.find(
         (dc) => dc.id === key || dc.name === key || dc.label == key,
      );
   }

   /**
    * listItems()
    * return an array of options for a given Object.Field
    * that is defined as a List.
    *
    * What is returned is an array of [ { id:'listItemValue', label:"display text"}]
    * that represents the valid options for the specified field.
    *
    * @param {string} objKey  either the ABObject.id or it's .name
    * @param {string} fieldKey either the ABField.id or it's .name
    * @param {string} langCode the language translation of the item to return
    * @return {array}
    */
   listItems(objKey, fieldKey, langCode = "en") {
      var results = [];

      var object = this.appPage.AB.objectByID(objKey);
      if (!object) return results;

      var field = object.fields((f) => {
         return f.id == fieldKey || f.columnName == fieldKey;
      })[0];
      if (!field) return results;

      //// TODO: refactor this to reuse ABFieldListCore.options()
      field.settings.options.forEach((o) => {
         var item = {
            id: o.id,
            name: o.text,
         };

         var label = o.text;
         var properLanguage = (o.translations || []).find((t) => {
            return t.language_code == langCode;
         });
         if (properLanguage) {
            label = properLanguage.text;
         }

         item.label = label;

         results.push(item);
      });

      return results;
   }

   /**
    * listItemID()
    * return the id (value) of a requested list item option.
    *
    * @param {string} objKey  either the ABObject.id or it's .name
    * @param {string} fieldKey either the ABField.id or it's .name
    * @param {string} optionText the .label or .text of an option
    * @param {string} langCode the language translation of the item to return
    * @return {array}
    */
   listItemID(objKey, fieldKey, optionText, langCode = "en") {
      var statusOptions = this.listItems(objKey, fieldKey, langCode);
      var requestedOption = statusOptions.find((o) => {
         return (
            o.text == optionText ||
            o.name == optionText ||
            o.label == optionText
         );
      });
      return requestedOption.id || null;
   }

   /**
    * object()
    * return the ABDataCollection referenced by the given key
    * @param {string} key the .name of the DataColleciton to return
    * @return {ABDataCollection}
    */
   object(key) {
      return this.appPage.AB.objectByID(key);
   }

   /**
    * objByID()
    * return an ABObject from a given id.
    * @param {string} id
    * @return {ABObject} or {undefined} if not found.
    */
   objByID(id) {
      return this.appPage.application.objects((o) => {
         return o.id == id;
      })[0];
   }

   /**
    * pathCSS()
    * return the path to an associated CSS file for this app.
    *
    * used in www/index.js bootup process to add in any application specific
    * css resources.
    *
    * if no css file is present, then return null.
    *
    * @return {string} path to css file:
    */
   pathCSS() {
      return null;
   }

   /**
    * Takes an array produced by lookupData() and indexes the data labels
    * according to the primary key. If it has multilingual labels, they will
    * be further indexed by language_code.
    *
    * @param {array} dataArray
    *  [
    *      { <primary_key>, <string label>, ... },
    *      { ... },
    *      ...
    *  ]
    *      OR
    *  [
    *      { <primary_key>, translations: [ ... ], ... },
    *      { ... },
    *      ...
    *  ]
    * @param {string} [primaryKeyField]
    *      Optional. If not specified, the primary key field will be guessed
    *      automatically from fields named "id" or ending in "id".
    * @param {string} [labelField]
    *      Optional. If not specified, the label field will be guessed
    *      automatically from field names ending in "label".
    * @return {object}
    *  {
    *      <primary_key>: <string label>,
    *      ...
    *  }
    *      OR
    *  {
    *      <primary_key>: { <language_code>: <string label>, ... },
    *      ...
    *  }
    */
   indexLookupData(dataArray, primaryKeyField = null, labelField = null) {
      var results = {};

      if (dataArray[0]) {
         // Examine first item for field names
         var item = dataArray[0];
         var fieldNames = Object.keys(item);

         // Best guess at what the primary key field is
         if (!primaryKeyField) {
            if (item.id) {
               // Fieldname is literally "id"
               primaryKeyField = "id";
            } else {
               // First fieldname that ends in "id"
               var keyFields = fieldNames.find((f) => {
                  return f.match(/id$/);
               });
               primaryKeyField = keyFields[0];
            }
         }

         if (!labelField && item.translations && item.translations[0]) {
            // Multilingual labels
            for (var f in item.translations[0]) {
               labelField = f;
               if (f.match(/label$/)) {
                  labelField = f;
                  break;
               }
            }
         } else if (!labelField) {
            // Simple labels
            /* eslint-disable-next-line no-redeclare */
            for (var f in item) {
               labelField = f;
               if (f.match(/label$/)) {
                  labelField = f;
                  break;
               }
            }
         }

         // Convert to indexed array
         dataArray.forEach((item) => {
            var label = item[labelField];

            // For multilingual, index the translations
            if (Array.isArray(item.translations)) {
               label = {};
               item.translations.forEach((trans) => {
                  label[trans.language_code] = trans[labelField];
               });
            }

            results[item[primaryKeyField]] = label;
         });
      }

      return results;
   }

   /**
    * reset()
    * implements a hard reset on the App.  We reset our status to
    * uninitialized state, and the perform an init()
    * @return {Promise}
    */
   async reset() {
      await this.appPage.AB.storage.set(this.refStatusKey(), null);
      // make sure each of our Datacollections have resset their
      // data:
      const allResets = [];
      this.datacollections.forEach((dc) => {
         allResets.push(dc.platformReset());
      });
      await Promise.all(allResets);
      await this.init();
   }
}
