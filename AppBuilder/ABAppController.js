/**
 * @class ABAppController
 *
 * Is responsible for managing all the routes/data/templates for a given
 * application shown under an page.
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
      this.page = null;
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
    * @param {PageObject} page
    *        the live instance of the Application Page Controller that
    *        displays this application.
    * @param {Array<String>} dcIDs
    * @return {Promise}
    */
   async init(page, dcIDs) {
      // save a reference to the lib/platform/pages/...Page.js object.
      this.page = page;
      if (dcIDs?.length > 0)
         this.datacollections = this.page.app.abApp.datacollectionsIncluded(
            (dc) => {
               return dcIDs.indexOf(dc.id) > -1 || dcIDs.indexOf(dc.name) > -1;
            }
         );

      // Emit a message if init doesn't complete within 25 seconds
      const initTimeout = setTimeout(() => {
         console.error(
            "ABApplication timed out during init(): " + this.page.app.abApp.id
         );
      }, this.initTimeout);

      return new Promise((resolve, reject) => {
         this.status = "init";

         // make sure our site user data has been properly
         // loaded. (1st load this needs to come from server call)
         if (
            this.page.app.resources.account.authToken == null &&
            this.page.app.resources.account.username == null
         )
            throw new Error("Not found authToken and username.");

         // make sure each of our Datacollections have loaded their data:
         const allInits = [];
         this.datacollections.forEach((dc) => {
            if (dc == null) {
               console.error("Could not find data collection for key:" + dc);
               return;
            }
            allInits.push(dc.init());
         });

         (async () => {
            try {
               this.status = "loading";
               await Promise.all(allInits);
               this.status = "ready";
               clearTimeout(initTimeout);
               resolve();
            } catch (err) {
               this.status = "ready";
               clearTimeout(initTimeout);
               reject(err);
            }
         })();
      });
   }

   /**
    * isReady
    * is our data ready to work with?
    * @return {bool}
    */
   isReady() {
      return this.status === "ready";
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
      // TODO:
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
         (dc) => dc.id === key || dc.name === key || dc.label == key
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
      const results = [];
      const object = this.page.app.AB.objectByID(objKey);
      if (object == null) return results;
      const field = object.fields(
         (f) => f.id === fieldKey || f.columnName === fieldKey
      )[0];
      if (field == null) return results;

      field.settings.options.forEach((o) => {
         const item = {
            id: o.id,
            name: o.text,
         };
         let label = o.text;
         const properLanguage = (o.translations || []).find((t) => {
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
    * object()
    * return the ABDataCollection referenced by the given key
    * @param {string} key the .name of the DataColleciton to return
    * @return {ABDataCollection}
    */
   object(key) {
      return this.page.app.AB.objectByID(key);
   }

   /**
    * reset()
    * implements a hard reset on the App.  We reset our status to
    * uninitialized state, and the perform an init()
    * @return {Promise}
    */
   async reset() {
      // make sure each of our Datacollections have resset their
      // data:
      const allResets = [];
      this.datacollections.forEach((dc) => {
         allResets.push(dc.reset());
      });
      await Promise.all(allResets);
   }
}
