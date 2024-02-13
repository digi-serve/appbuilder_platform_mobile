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
      var OBJ = this.datasource;
      if (OBJ) {
         OBJ.on("CREATE", (data) => {
            // if valid for this DC
            if (this.__filterDatasource.isValid(data)) {
               // find which field is the PK
               var PK = this.datasource.fieldUUID(data);

               // if entry NOT currently in datacollection
               if (!this.__dataCollection.exists(data[PK])) {
                  // webix datacollections need an .id field
                  if (!data.id) {
                     data.id = data[PK];
                  }

                  // include it in our list:
                  this.__dataCollection.add(data);

                  // alert anyone attached to us that we have CREATEd
                  // data.
                  this.emit("CREATE", data);
               }
            }
         });

         OBJ.on("UPDATE", (data) => {
            // find which field is the PK
            var PK = this.datasource.fieldUUID(data);
            var ID = data[PK];

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
               var remainingEntries = this.QL().value();
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
      return this.settings.syncType == "1" || this.settings.syncType == 1;
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
   reduceCondition(values) {
      new Promise((resolve /*, reject */) => {
         var pk = this.datasource.PK();
         if (!Array.isArray(values)) values = [values];
         var listIDs = values.map((v) => {
            return v[pk];
         });
         this._reducedConditions = {
            pk: pk,
            values: listIDs,
         };

         if (this.__filterDatasource) {
            this.__filterDatasource.setReducedConditions(
               this._reducedConditions
            );
         }

         //
         //  save these to disk
         //
         const storage = this.AB.storage;
         var lock = storage.Lock(this.refStorage());
         return lock
            .acquire()
            .then(() => {
               return storage.get(this.refStorage()).then((data) => {
                  // shouldn't have uninitialized data at this point,
                  // but just in case:
                  data = data || {};

                  data.reducedConditions = this._reducedConditions;

                  return storage.set(this.refStorage(), data);
               });
            })
            .then(() => {
               lock.release();
               resolve();
            });
      });
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
      var pk = this.datasource.PK();
      var ID = entry[pk];
      this._reducedConditions.values.push(ID);

      // create a new set of values we can send to .reduceCondition()
      // to properly update the filter and data storage.
      var mockValues = [];
      this._reducedConditions.values.forEach((val) => {
         var obj = {};
         obj[pk] = val;
         mockValues.push(obj);
      });

      return this.reduceCondition(mockValues);
   }

   /**
    * platformInit
    * make sure we are ready for operation on this platform.
    * this implies we need to make sure each ABObject we use can
    * store information in the DB.  This is done in the
    * object.model().local()
    * @return {Promise}
    */
   platformInit() {
      return new Promise((resolve, reject) => {
         // Make sure our ABObject is properly setup on the platform
         var ds = this.datasource;
         if (!ds) {
            // if we couldn't find the reference to our datasource
            // someone should know about this!
            var dsError = new Error(
               "ABViewDataCollection:platformInit(): unknown datasource"
            );
            dsError.context = { settings: this.settings };
            this.AB.analytics.logError(dsError);

            // but continue on just in case this is a dangling DC
            // that isn't actually being used.
            resolve();
            return;
         }

         ds.model()
            .local()
            .platformInit()
            .then((objectData) => {
               // once that is done, make sure we can track our DC info
               const storage = this.AB.storage;
               var lock = storage.Lock(this.refStorage());
               return lock
                  .acquire()
                  .then(() => {
                     return storage.get(this.refStorage()).then((data) => {
                        // if we already have our storage set:
                        if (data) {
                           this.bootState = data.bootState;
                           this._reducedConditions = data.reducedConditions;

                           // save our info:
                           if (this._reducedConditions) {
                              if (this.__filterDatasource) {
                                 this.__filterDatasource.setReducedConditions(
                                    this._reducedConditions
                                 );
                              }
                           }
                           return;
                        } else {
                           // this must be our 1st time through.
                           // our bootState should be "uninitialized" until
                           // we get our 1st response from the Server:
                           this.bootState = "uninitialized";
                           this._reducedConditions = null;

                           // save our info:
                           return storage.set(this.refStorage(), {
                              bootState: this.bootState,
                              reducedConditions: this._reducedConditions,
                           });
                        }
                     });
                  })
                  .then(() => {
                     lock.release();
                  });
            })
            .then(() => {
               resolve();
            })
            .catch(reject);
      });
   }

   /**
    * platformReset
    * this is called when the App requires a hard reset().
    * Our job is to clear out any data we are storing to a new, uninitialized
    * state.
    * @return {Promise}
    */
   platformReset() {
      return new Promise((resolve, reject) => {
         // Make sure our ABObject is properly setup on the platform
         this.datasource
            .model()
            .local()
            .platformReset()
            .then(() => {
               // once that is done, make sure we can clear our DC info
               const storage = this.AB.storage;
               var lock = storage.Lock(this.refStorage());
               return lock
                  .acquire()
                  .then(() => {
                     return storage.set(this.refStorage(), null);
                  })
                  .then(() => {
                     lock.release();
                  });
            })
            .then(() => {
               // now clear all our live values:
               this.clearAll();
               resolve();
            })
            .catch(reject);
      });
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
   processIncomingData(dataNew) {
      return super.processIncomingData(dataNew).then(() => {
         // make sure we update our bootState!
         if (this.bootState == "uninitialized") {
            this.bootState = "initialized";
         }
         // once that is done, make sure we can track our DC info
         const storage = this.AB.storage;
         var lock = storage.Lock(this.refStorage());
         return lock
            .acquire()
            .then(() => {
               return storage.get(this.refStorage()).then((data) => {
                  data = data || {};

                  data.bootState = this.bootState;

                  return storage.set(this.refStorage(), data);
               });
            })
            .then(() => {
               lock.release();
            });
      });
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
   remoteUpdate(data) {
      super.remoteUpdate(data).then(() => {
         // make sure local storage has these values in it:
         return this.datasource.model().local().localStorageStore(data);
      });
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
         this._pendingLoadData = setTimeout(() => {
            this.loadData();
            delete this._pendingLoadData;
         }, 1000);
      } else {
         clearTimeout(this._pendingLoadData);
         delete this._pendingLoadData;
         this.loadDataDelayed();
      }
   }

   getFirstRecord() {
      const id = this.__dataCollection.getFirstId();
      return this.__dataCollection.getItem(id);
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
      let dc = new webix.DataCollection({
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
               (start, count) => {
                  if (start < 0) start = 0;

                  // load more data to the data collection
                  this.loadData(start, count);

                  return false; // <-- prevent the default "onDataRequest"
               }
            );
         }

         if (!dataStore.___AD.onAfterLoadEvent) {
            dataStore.___AD.onAfterLoadEvent = dataStore.attachEvent(
               "onAfterLoad",
               () => {
                  this.emit("loadData", {});
               }
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

   platformFind(model, cond) {
      model = model || this.datasource.model();

      if (this.bootState == "initialized") {
         // We have already initialized our data, so that means
         // we have local data that we can work with right now.

         // NOTE: we will get all the local data for our Object
         // and let our filterComponent tell us if it should be
         // included:
         var modelLocal = model.local();
         return modelLocal
            .findAll(cond)
            .then((entries) => {
               var validEntries = [];
               entries.forEach((entry) => {
                  // add it to our list if it passes our filter:
                  if (this.__filterDatasource.isValid(entry)) {
                     validEntries.push(entry);
                  }
               });

               // load our valid entries:
               // ! This call prevents this from returning found data @achoobert
               // ? Why would this ever be nessicary?
               this.processIncomingData(validEntries);

               // we can start working on this data now
               // NOTE: resolve() should be done in .processIncomingData() now
               // resolve(validEntries);
            })
            .then((validEntries) => {
               // ? is it really nessicary to call the remote here? @achoobert
               // However, this local data might be out of date
               // with the server.  So let's spawn a remote
               // lookup in the background:

               var modelRemote = model.remote();

               // reset the context on the Model so any data updates get sent to this
               // DataCollection
               // NOTE: we only do this on loadData(), other operations should be
               // received by the related Objects.
               modelRemote.contextKey(ABDataCollectionCore.contextKey());
               modelRemote.contextValues({
                  id: this.id,
                  verb: "refresh",
               });

               // id: the datacollection.id
               // verb: tells our ABRelay.listener why this remote lookup was called.

               // initiate the request:
               modelRemote.findAll(cond);

               // return valid entries:
               return validEntries;
            });
      } else {
         //  We have not been initialized yet, so we need to
         //  request our data from the remote source()
         var modelRemote = model.remote();

         // reset the context on the Model so any data updates get sent to this
         // DataCollection
         // NOTE: we only do this on loadData(), other operations should be
         // received by the related Objects.
         modelRemote.contextKey(ABDataCollectionCore.contextKey());
         modelRemote.contextValues({
            id: this.id,
            verb: "uninitialized",
         });
         // id: the datacollection.id
         // verb: tells our ABRelay.listener why this remote lookup was called.

         // initiate the request:
         return modelRemote.findAll(cond);
         // note:  our ABRelay.listener will take incoming data and call:
         // this.processIncomingData()
      }
   }

   // this.QL().value() is the same as this.getAllRecords(). Unnecessary if we aren't actually using QL to do anything.
   // If we need it should switch to the new ABQL
   // Mock QL so that the current calls still work.
   QL() {
      console.warn(
         `Depreciating ABDatacollection.QL(). Try ABDatacollection.getAllRecords() instead?`
      );
      return {
         value: (...args) => {
            if (args.length > 0)
               console.warn(
                  `ABDatacollection.QL().value() called with args`,
                  args
               );
            return this.getAllRecords();
         },
      };
   }
};
