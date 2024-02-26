/**
 * ABDataCollection
 *
 * This is the platform dependent implementation of ABObject.
 *
 */

const ABDataCollectionCore = require("../core/ABDataCollectionCore");

module.exports = class ABDataCollection extends ABDataCollectionCore {
   constructor(...args) {
      super(...args);

      this.bootState = "??";
      // bootState represents where we are on the platform setup.
      // "uninitialized":
      //      the first time an app is loaded, none of our Datacollections
      //      have requested their initial data from the server, so they
      //      are considered "uninitialized".
      //
      // "initialized":
      //      after data from the server has been requested the 1st time,
      //      then there is some local data that we can use to begin
      //      operating with.
      //
      // these values are setup during: .platformInit()

      this.__bindComponentIds = [];
      // __bindComponentIds is an array of other components.id that have .bind()
      // this ABViewDataCollection.

      this.__dataCollection = this._dataCollectionNew();

      //// TODO: test out these OBJ.on() propagations:
      const OBJ = this.datasource;
      if (OBJ != null) {
         OBJ.on("CREATE", (data) => {
            const copiedData = structuredClone(data);
            // if valid for this DC
            if (this.__filterDatasource.isValid(copiedData)) {
               // find which field is the PK
               const PK = this.datasource.fieldUUID(copiedData);

               // if entry NOT currently in datacollection
               if (!this.__dataCollection.exists(copiedData[PK])) {
                  // webix datacollections need an .id field
                  if (copiedData.id == null) copiedData.id = copiedData[PK];

                  // include it in our list:
                  this.__dataCollection.add(copiedData);

                  // alert anyone attached to us that we have CREATEd
                  // data.
                  this.emit("CREATE", copiedData);
               }
            }
         });

         OBJ.on("UPDATE", (data) => {
            const ID = data[this.datasource.fieldUUID(data)];

            // if entry IS currently in datacollection
            if (this.__dataCollection.exists(ID)) {
               // update our copy
               this.__dataCollection.updateItem(ID, data);

               // alert anyone attached to us that we have UPDATEd
               // data.
               this.emit("UPDATE", data);
            }
         });

         OBJ.on("DELETE", (ID) => {
            // if entry IS currently in datacollection
            if (this.__dataCollection.exists(ID)) {
               // remove it from our list:
               this.__dataCollection.remove(ID);

               // if I'm maintaining a set of reducedConditions:
               const remainingEntries = this.getAllRecords();
               this.reduceCondition(remainingEntries);

               // alert anyone attached to us that we have DELETEd
               // data.
               this.emit("DELETE", ID);
            }
         });
      }
   }

   /**
    * isServerPreferred()
    * return true if this data is primarily Server side data. Server side data
    * that is different than the copy we have locally should overwrite our
    * local data.
    * @return {bool}
    */
   isServerPreferred() {
      return this.settings.syncType == "1";
      // NOTE: syncType = "2" is client preferred.
   }

   /**
    * @method dataCollectionRefresh
    * create a data collection to cache
    *
    * @return {Promise}
    *           .resolve()
    */
   init() {
      // prevent initialize many times
      if (this.initialized) return;
      super.init();

      // __dataCollection must implement these methods:
      // .add( {data}, indx)
      // .attachEvent("onAfterCursorChange", fn);
      // .clearAll()
      // .exists( ID )
      // .filter( fn )
      // .find( fn, bool)
      // .find({})
      // .getCursor(): return the id of the item the cursor is on
      // .getFirstId()
      // .getItem( ID ) : the row of data for row.id == ID
      // .getNextId(ID) : ID = the current row, that you want the Next one for
      // .parse({ data:[] })
      // .remove( ID )
      // .setCursor( ID )
      // .updateItem(ID, {data})

      /*
//// TODO: transferr these to our AB.comm.relay.*

        // events: tie our devined on "ab.datacollection.create" to the 
        // platform specified event notification.
        AD.comm.hub.subscribe('ab.datacollection.create', (msg, data) => {
            this.emit("ab.datacollection.create", msg, data);
        });

        AD.comm.hub.subscribe('ab.datacollection.update', (msg, data) => {
            this.emit("ab.datacollection.update", msg, data);
        });

        // We are subscribing to notifications from the server that an item may be stale and needs updating
        // We will improve this later and verify that it needs updating before attempting the update on the client side
        AD.comm.hub.subscribe('ab.datacollection.stale', (msg, data) => {
            this.emit("ab.datacollection.stale", msg, data);
        });

        AD.comm.hub.subscribe('ab.datacollection.delete', (msg, data) => {
            this.emit("ab.datacollection.delete", msg, data);
        });
*/
   }

   /**
    * reduceCondition()
    * take the provided data and track the id's of the entries.
    * Later when performing filter.isValid() operations, we can use this
    * instead of trying to parse through embedded queries and filters...
    * @param {array} values ABObject values that represent the data for this query.
    * @return {Promise} resolved when conditions are stored
    */
   async reduceCondition(values) {
      const pk = this.datasource.PK();
      if (!Array.isArray(values)) values = [values];
      this._reducedConditions = {
         pk: pk,
         values: values.map((v) => {
            return v[pk];
         }),
      };
      if (this.__filterDatasource)
         this.__filterDatasource.setReducedConditions(this._reducedConditions);

      //
      //  save these to disk
      //
      const storage = this.AB.storage;
      const lock = storage.Lock(this.refStorage());
      await lock.acquire();
      const data = (await storage.get(this.refStorage())) || {};

      // shouldn't have uninitialized data at this point,
      // but just in case:
      data.reducedConditions = this._reducedConditions;
      await storage.set(this.refStorage(), data);
      lock.release();
   }

   /**
    * addReducedConditionEntry()
    * used to add a single entry to our reduced conditions clause.
    * this adds it to the already existing list.
    * @param {obj} entry
    * @return {Promise}
    */
   addReducedConditionEntry(entry) {
      // insert ID into our current list of reducedConditions
      const pk = this.datasource.PK();
      this._reducedConditions.values.push(entry[pk]);

      // create a new set of values we can send to .reduceCondition()
      // to properly update the filter and data storage.
      return this.reduceCondition(
         this._reducedConditions.values.map((value) => {
            const obj = {};
            obj[pk] = value;
            return obj;
         }),
      );
   }

   /**
    * platformInit
    * make sure we are ready for operation on this platform.
    * this implies we need to make sure each ABObject we use can
    * store information in the DB.  This is done in the
    * object.model().local()
    * @return {Promise}
    */
   async platformInit() {
      // Make sure our ABObject is properly setup on the platform
      const ds = this.datasource;
      if (ds == null) {
         // if we couldn't find the reference to our datasource
         // someone should know about this!
         const dsError = new Error(
            "ABViewDataCollection:platformInit(): unknown datasource",
         );
         dsError.context = { settings: this.settings };
         this.AB.analytics.logError(dsError);

         // but continue on just in case this is a dangling DC
         // that isn't actually being used.
         return;
      }

      // once that is done, make sure we can track our DC info
      const storage = this.AB.storage;
      const lock = storage.Lock(this.refStorage());
      await lock.acquire();
      const data = await storage.get(this.refStorage());

      // if we already have our storage set:
      if (data != null) {
         this.bootState = data.bootState;
         this._reducedConditions = data.reducedConditions;

         // save our info:
         if (this._reducedConditions && this.__filterDatasource)
            this.__filterDatasource.setReducedConditions(
               this._reducedConditions,
            );
      } else {
         // this must be our 1st time through.
         // our bootState should be "uninitialized" until
         // we get our 1st response from the Server:
         this.bootState = "uninitialized";
         this._reducedConditions = null;

         // save our info:
         await storage.set(this.refStorage(), {
            bootState: this.bootState,
            reducedConditions: this._reducedConditions,
         });
      }
      lock.release();
   }

   /**
    * platformReset
    * this is called when the App requires a hard reset().
    * Our job is to clear out any data we are storing to a new, uninitialized
    * state.
    * @return {Promise}
    */
   async platformReset() {
      await this.datasource.model().local().platformReset();

      // once that is done, make sure we can clear our DC info
      const storage = this.AB.storage;
      const lock = storage.Lock(this.refStorage());
      await lock.acquire();
      await storage.set(this.refStorage(), null);
      lock.release();

      // now clear all our live values:
      this.clearAll();
   }

   /**
    * processIncomingData()
    * is called from loadData() once the data is returned.  This method
    * allows the platform to make adjustments to the data based upon any
    * platform defined criteria.
    * @param {obj} data  the data as it was returned from the Server
    *        which should be in following format:
    *        {
    *          status: "success", // or "error"
    *          data:[ {ABObjectData}, {ABObjectData}, ...]
    *        }
    */
   async processIncomingData(dataNew) {
      await super.processIncomingData(dataNew);

      // make sure we update our bootState!
      if (this.bootState == "uninitialized") this.bootState = "initialized";

      // once that is done, make sure we can track our DC info
      const storage = this.AB.storage;
      const lock = storage.Lock(this.refStorage());
      await lock.acquire();
      const data = storage.get(this.refStorage()) || {};
      data.bootState = this.bootState;
      await storage.set(this.refStorage(), data);
      lock.release();
   }

   /**
    * refStorage
    * return a unique key for this datacollection for our storage key.
    * we will store information about our DC here like:
    *      "bootState" :  [ "uninitialized", "initialized" ]
    * @return {string}
    */
   refStorage() {
      return "dc-" + this.id;
   }

   /**
    * @method remoteUpdate
    * this alerts us of a change in our data that came from a remote
    * source: socket update, Relay response, etc...
    */
   async remoteUpdate(data) {
      await super.remoteUpdate(data);

      // make sure local storage has these values in it:
      await this.datasource.model().local().localStorageStore(data);
   }

   /**
    * currentUserUsername
    * must return the proper value for the current user that would match a "user" field
    * in an object.
    * This is platform dependent, so must be implemented by a child object.
    * @return {string}
    */
   currentUserUsername() {
      console.error("Who is calling .currentUserUsername()?");
      return this.AB.account.username;
   }

   /**
    * this code implements a mechanism to delay the execution of the loadData() function.
    * If there is no pending data load, it schedules the loadData() function to be executed
    * after a delay of 1000 milliseconds (1 second). If there is already a pending data load,
    * it cancels the previous timeout and immediately calls
    * the loadDataDelayed() function instead.
    *
    * This is likely because the function is a heavy operation and
    * this often gets called multiple times in a row.
    */
   loadDataDelayed() {
      if (!this._pendingLoadData) {
         this._pendingLoadData = setTimeout(async () => {
            await this.loadData();
            delete this._pendingLoadData;
         }, 1000);
      } else {
         clearTimeout(this._pendingLoadData);
         delete this._pendingLoadData;
         this.loadDataDelayed();
      }
   }

   getFirstRecord() {
      return this.__dataCollection.getItem(this.__dataCollection.getFirstId());
   }

   getAllRecords() {
      // This appears to work well.
      return this.__dataCollection.find({});
   }

   /** Private methods */

   /**
    * @method _dataCollectionNew
    * Get webix.DataCollection
    *
    * @return {webix.DataCollection}
    *
    * @param {Array} data - initial data
    */
   _dataCollectionNew(data) {
      // get a webix data collection
      /* global webix */
      const dc = new webix.DataCollection({
         data: data || [],
      });
      this._extendCollection(dc);
      return dc;
   }

   _extendCollection(dataStore) {
      // Apply this data collection to support multi-selection
      // https://docs.webix.com/api__refs__selectionmodel.html
      webix.extend(dataStore, webix.SelectionModel);
      dataStore.___AD = dataStore.___AD || {};

      // Implement .onDataRequest for paging loading
      if (!this.settings.loadAll) {
         if (!dataStore.___AD.onDataRequestEvent) {
            dataStore.___AD.onDataRequestEvent = dataStore.attachEvent(
               "onDataRequest",
               async (start, count) => {
                  if (start < 0) start = 0;

                  // load more data to the data collection
                  await this.loadData(start, count);

                  return false; // <-- prevent the default "onDataRequest"
               },
            );
         }
         if (!dataStore.___AD.onAfterLoadEvent) {
            dataStore.___AD.onAfterLoadEvent = dataStore.attachEvent(
               "onAfterLoad",
               () => {
                  this.emit("loadData", {});
               },
            );
         }
      }

      // override unused functions of selection model
      dataStore.addCss = function () {};
      dataStore.removeCss = function () {};
      dataStore.render = function () {};

      // NOTE: this doesn't seem relevant on the Mobile Platform:
      // if (!dataStore.___AD.onAfterLoad) {
      //    dataStore.___AD.onAfterLoad = dataStore.attachEvent(
      //       "onAfterLoad",
      //       () => {
      //          this.hideProgressOfComponents();
      //       }
      //    );
      // }
   }

   ///
   /// MOBILE Platform Changes
   ///
   /// These changes will eventually make it into the ABDataCollectionCore
   /// once the web and server side platforms are updated to be able to handle
   /// modelLocal, modelRemote operations.

   async platformFind(model, cond) {
      const myModel = model || this.datasource.model();
      const modelRemote = myModel.remote();
      const contextValues = {
         id: this.id,
         verb: "refresh",
      };
      if (this.bootState !== "initialized") {
         contextValues.verb = "uninitialized";
         await this.processIncomingData(
            (await myModel.local().findAll(cond)).filter((entry) =>
               // add it to our list if it passes our filter:
               this.__filterDatasource.isValid(entry),
            ),
         );
      }
      modelRemote.contextKey(ABDataCollectionCore.contextKey());
      modelRemote.contextValues(contextValues);
      return await modelRemote.findAll(cond);
   }

   // this.QL().value() is the same as this.getAllRecords(). Unnecessary if we aren't actually using QL to do anything.
   // If we need it should switch to the new ABQL
   // Mock QL so that the current calls still work.
   QL() {
      console.warn(
         `Depreciating ABDatacollection.QL(). Try ABDatacollection.getAllRecords() instead?`,
      );
      return {
         value: (...args) => {
            if (args.length > 0)
               console.warn(
                  `ABDatacollection.QL().value() called with args`,
                  args,
               );
            return this.getAllRecords();
         },
      };
   }
};
