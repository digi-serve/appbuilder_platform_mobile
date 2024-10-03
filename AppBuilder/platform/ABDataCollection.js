/**
 * ABDataCollection
 *
 * This is the platform dependent implementation of ABObject.
 *
 */

const ABDataCollectionCore = require("../core/ABDataCollectionCore");

const EVENT_KEY_MODEL = "model";
const EVENT_KEY_BACKUP_CALL = "backupCall";
const EVENT_BACKUP_METHOD_LOADDATA = "loadData";
const EVENT_BACKUP_METHOD_UPDATE_SYNC_DATA = "updateSyncData";
const EVENT_PATH = "abDCs.id=:id";
const TIME_WAIT = 1000;
const PENDING_PROMISE_LIMIT = 100;
module.exports = class ABDataCollection extends ABDataCollectionCore {
   constructor(attributes, AB) {
      super(attributes, AB);
      this._cond = {
         where: { glue: "and", rules: [] },
         // limit: 100,
         skip: 0,
         sort: [],
         populate: false,
      };
      this._hasInitStarted = false;
      this._interruptingData = [];
      this._isSyncing = false;
      this._latestItemDatetime = null;
      this._lock = null;
      this._model = null;
      const app = this.AB.app;
      const page = (this._page = app.pages.appPage);
      const analytics = (this._analytics = app.resources.analytics);
      this.on(
         EVENT_KEY_BACKUP_CALL,
         async (backupMethod, newBackupMethodArgs) => {
            try {
               const result = this[backupMethod](...newBackupMethodArgs);
               result instanceof Promise && (await result);
            } catch (err) {
               console.error(err);
               analytics.logError(err);
               await new Promise((resolve) => {
                  page.f7App.dialog
                     .alert(`<t>${err.message}</t>`, "<t>Error</t>", () => {
                        resolve();
                     })
                     .open();
               });
            }
         },
      );
      this.on(EVENT_KEY_MODEL, (context, res, instance) => {
         this.model.dataCallback(context, res, instance);
      });
   }

   _addInterruptingData(key) {
      this._interruptingData.indexOf(key) < 0 &&
         this._interruptingData.push(key);
   }

   /**
    * @method _dataCollectionNew
    * Get webix.DataCollection
    *
    * @return {webix.DataCollection}
    *
    * @param {Array} data - initial data
    */
   _dataCollectionNew(data = []) {
      // get a webix data collection
      /* global webix */
      const dc = new webix.DataCollection({
         data,
      });

      // Apply this data collection to support multi-selection
      // https://docs.webix.com/api__refs__selectionmodel.html
      webix.extend(dc, webix.SelectionModel);
      dc.___AD = dc.___AD || {};

      // Implement .onDataRequest for paging loading
      if (!this.settings.loadAll) {
         if (!dc.___AD.onDataRequestEvent) {
            dc.___AD.onDataRequestEvent = dc.attachEvent(
               "onDataRequest",
               async () => {
                  if (start < 0) start = 0;

                  // load more data to the data collection
                  await this.loadData();

                  return false; // <-- prevent the default "onDataRequest"
               },
            );
         }
         if (!dc.___AD.onAfterLoadEvent) {
            dc.___AD.onAfterLoadEvent = dc.attachEvent("onAfterLoad", () => {
               this.emit("loadData", {});
            });
         }
      }

      // override unused functions of selection model
      dc.addCss = () => {};
      dc.removeCss = () => {};
      dc.render = () => {};
      return dc;
   }

   async _getDCData() {
      const storage = this.AB.app.resources.storage;
      const refStorage = this.refStorage();
      const lock = this._lock;
      try {
         await lock.acquire();
         const dcData = {
            data: [],
            limit: 0,
            offset: 0,
            pos: 0,
            total_count: 0,
         };
         await Promise.all([
            (async () => {
               const key = "limit";
               dcData[key] =
                  parseInt(await storage.get(refStorage, key)) || dcData[key];
            })(),
            (async () => {
               const key = "offset";
               dcData[key] =
                  parseInt(await storage.get(refStorage, key)) || dcData[key];
            })(),
            (async () => {
               const key = "pos";
               dcData[key] =
                  parseInt(await storage.get(refStorage, key)) || dcData[key];
            })(),
            (async () => {
               const key = "total_count";
               dcData[key] =
                  parseInt(await storage.get(refStorage, key)) || dcData[key];
            })(),
            (async () => {
               dcData.data = (await storage.getAll(refStorage)).filter(
                  (value) => value instanceof Object,
               );
            })(),
         ]);
         lock.release();
         return dcData;
      } catch (err) {
         lock.release();
         throw err;
      }
   }

   _removeInterruptingData(key) {
      if (this._interruptingData.indexOf(key) < 0) return;
      const interruptingData = this._interruptingData;
      interruptingData.splice(interruptingData.indexOf(key), 1);
   }

   async _saveDCData(dcData) {
      const storage = this.AB.app.resources.storage;

      // Pull data to data collection
      // we will keep track of the resolve, reject for this
      // operation.
      // the actual resolve() should happen in the
      // .processIncomingData() after the  data is processed.
      const pendingLoadData = new Promise((resolve, reject) => {
         this._pendingLoadDataResolve = {
            resolve: resolve,
            reject: reject,
         };
      });
      const lock = this._lock;
      let pendingPromises = [];
      this._pendingSaves = pendingPromises;
      try {
         await lock.acquire();
         for (const key in dcData) {
            const refStorage = this.refStorage();
            switch (key) {
               case "data": {
                  const values = dcData[key];

                  // Clear old data.
                  this._latestItemDatetime = null;
                  const storedValues = await storage.getAll(refStorage);
                  const interruptingData = this._interruptingData;
                  for (const storedValue of storedValues) {
                     if (
                        !(storedValue instanceof Object) ||
                        values.findIndex((e) => e.id === storedValue.id) > -1
                     )
                        continue;

                     // if the stored value wasn't found in the incoming values
                     // remove it from our stored data.
                     pendingPromises.push(
                        (async () => {
                           if (
                              !storedValue.isConfirmed &&
                              interruptingData.indexOf(storedValue.id) > -1
                           )
                              return;
                           const key = storedValue.id;
                           await Promise.all([
                              storage.clear(refStorage, key),
                              storage.set(
                                 refStorage,
                                 "total_count",
                                 (this.__totalCount - 1).toString(),
                              ),
                           ]);

                           // TODO (Guy): Sometimes this gets an error. To reproduce, add data continuously until you get an error. Then, delete the data in AppBuilder and wait for the response.
                           // TODO (Guy): This is temporary fix.
                           const dcValues = this.getData((e) => e.id !== key);
                           const dataStatus = this._dataStatus;
                           try {
                              this.__dataCollection.remove(key);
                           } catch (err) {
                              this.clearAll();
                              if (
                                 dataStatus === this.dataStatusFlag.initialized
                              )
                                 this._dataStatus = dataStatus;
                              dcValues.forEach((dcValue) => {
                                 this.__dataCollection.add(dcValue);
                              });
                           }
                           this.__totalCount--;
                        })(),
                     );
                     if (pendingPromises.length < PENDING_PROMISE_LIMIT)
                        continue;
                     await Promise.all(pendingPromises);
                     pendingPromises = [];
                  }
                  pendingPromises.length > 0 &&
                     (await Promise.all(pendingPromises));
                  pendingPromises = [];
                  if (values.length === 0) break;
                  const isSourceTypeObject = this.sourceType === "object";
                  if (isSourceTypeObject)
                     this._latestItemDatetime = values[0]["updated_at"];
                  for (let i = 0; i < values.length; i++) {
                     const value = values[i];
                     if (
                        isSourceTypeObject &&
                        new Date(this._latestItemDatetime) <
                           new Date(value["updated_at"])
                     )
                        this._latestItemDatetime = value["updated_at"];
                     if (interruptingData.indexOf(value.id) < 0)
                        pendingPromises.push(
                           storage.set(refStorage, value.id, {
                              data: value,
                              id: value.id,
                              isConfirmed: true,
                           }),
                        );

                     // Wait for 100 promises each time.
                     if (pendingPromises.length < PENDING_PROMISE_LIMIT)
                        continue;
                     await Promise.all(pendingPromises);
                     pendingPromises = [];
                  }
                  break;
               }
               default:
                  pendingPromises.push(
                     storage.set(refStorage, key, dcData[key].toString()),
                  );
                  break;
            }
         }
         pendingPromises.length > 0 && (await Promise.all(pendingPromises));
         pendingPromises = null;
         this._pendingSaves = null;
         lock.release();
      } catch (err) {
         lock.release();
         throw err;
      }
      await this.processIncomingData(await this._getDCData());
      await pendingLoadData;
   }

   /**
    * @method _updateSyncAffectedDCs
    * Reload affected datacollections.
    * @return {Promise}
    */
   async _updateSyncAffectedDCs() {
      console.assert(this.AB.app.abDCs, "this.AB.app.abDCs not defined"); //
      const connectedDatasources = this.datasource
         .connectFields()
         .map((field) => field.datasourceLink.id);
      await Promise.all(
         this.AB.app.abDCs
            .filter((dc) => connectedDatasources.includes(dc.datasource.id))
            .map((dc) => dc.updateSyncData()),
      );
   }

   async _waitForSync() {
      await new Promise((resolve) => {
         const waitForSync = () => {
            if (!this._isSyncing) {
               resolve();
               return;
            }
            setTimeout(() => {
               waitForSync();
            }, TIME_WAIT);
         };
         waitForSync();
      });
   }

   async init() {
      if (this._hasInitStarted) return;
      this._hasInitStarted = true;
      super.init();
      const AB = this.AB;

      // pull the defined sort values
      const sorts = this.settings.objectWorkspace.sortFields || [];

      // pull filter conditions
      let wheres = AB.cloneDeep(
         this.settings.objectWorkspace.filterConditions || {},
      );

      // if we pass new wheres with a reload use them instead
      if (this.__reloadWheres) wheres = this.__reloadWheres;
      wheres.glue = wheres.glue || "and";
      wheres.rules = wheres.rules || [];
      const __additionalWheres = {
         glue: "and",
         rules: [],
      };

      // add the filterCond if there are rules to add
      if (this.__filterCond?.rules?.length > 0)
         __additionalWheres.rules.push(this.__filterCond);

      // Filter by a selected cursor of a link DC
      let linkRule = this.ruleLinkedData();
      if (!this.settings.loadAll && linkRule)
         __additionalWheres.rules.push(linkRule);
      // pull data rows following the follow data collection
      else if (this.datacollectionFollow) {
         const followCursor = this.datacollectionFollow.getCursor();

         // store the PK as a variable
         let PK = this.datasource.PK();

         // if the datacollection we are following is a query
         // add "BASE_OBJECT." to the PK so we can select the
         // right value to report the cursor change to
         if (this.datacollectionFollow.settings.isQuery)
            PK = `BASE_OBJECT.${PK}`;
         if (followCursor) {
            wheres = {
               glue: "and",
               rules: [
                  {
                     key: this.datasource.PK(),
                     rule: "equals",
                     value: followCursor[PK],
                  },
               ],
            };
         }
         // Set no return rows
         else
            wheres = {
               glue: "and",
               rules: [
                  {
                     key: this.datasource.PK(),
                     rule: "equals",
                     value: "NO RESULT ROW",
                  },
               ],
            };
      }

      // Combine setting & program filters
      if (__additionalWheres.rules.length) {
         if (wheres.rules.length) __additionalWheres.rules.unshift(wheres);
         wheres = __additionalWheres;
      }

      // remove any null in the .rules
      // if (wheres?.rules?.filter) wheres.rules = wheres.rules.filter((r) => r);
      wheres = this.datasource.whereCleanUp(wheres);

      // set query condition
      const cond = {
         where: wheres || {},
         // limit: 100,
         skip: 0,
         sort: sorts,
         populate: this.shouldPopulate,
      };

      // if settings specify loadAll, then remove the limit
      if (this.settings.loadAll && !this.isCursorFollow) delete cond.limit;

      //
      // Step 1: make sure any DataCollections we are linked to are
      // initialized first.  Then proceed with our initialization.
      //
      const parentDc = this.datacollectionLink || this.datacollectionFollow;

      // If we are linked to another datacollection then wait for it
      if (parentDc) await this.waitForDataCollectionToInitialize(parentDc);

      //
      // Step 2: if we have any filter rules that depend on other DataCollections,
      // then wait for them to be initialized first.
      // eg: "(not_)in_data_collection" rule filters
      const pendingRelatedRuleDC = [];
      wheres = wheres || { glue: "and", rules: [] };
      wheres.glue = wheres.glue || "and";
      wheres.rules = wheres.rules || [];
      wheres.rules.forEach((rule) => {
         // if this collection is filtered by data collections we need to load them in case we need to validate from them later
         if (
            rule.rule == "in_data_collection" ||
            rule.rule == "not_in_data_collection"
         ) {
            const dc = AB.datacollectionByID(rule.value);
            if (dc != null) {
               pendingRelatedRuleDC.push(
                  this.waitForDataCollectionToInitialize(dc),
               );
            }
         }
      });
      if (pendingRelatedRuleDC.length > 0)
         await Promise.all(pendingRelatedRuleDC);
      this._cond = cond;
      this._lock = new AB.app.utils.Lock();
   }

   getAllRecords() {
      return this.getData();
   }

   async loadData(backupDCData) {
      const lock = this._lock;
      const storage = this.AB.app.resources.storage;
      const refStorage = this.refStorage();
      try {
         if (this._isSyncing) await this._waitForSync();
         this._isSyncing = true;
         let status = 0;
         try {
            await lock.acquire();
            status = await storage.get(refStorage, "status");
            lock.release();
         } catch (err) {
            lock.release();
            throw err;
         }
         // console.assert(status, `ABDataCollection::loadData(): missing status ${this.label} , ${this.id}`);//
         switch (status) {
            // status == 1: The local DC storage has been initialize in the past
            case 1: {
               if (this._dataStatus === this.dataStatusFlag.initialized) {
                  this._isSyncing = false;
                  console.log(
                     `ABDataCollection::loadData()::: initialized ${this.label} , ${this.id}`,
                  );
                  return;
               }

               // since we have pulled data before, just get the local data
               // and work with that.
               const dcData = await this._getDCData();
               const data = dcData.data;
               const isSourceTypeObject = this.sourceType === "object";
               // figure out the latest time an item has been updated
               if (data.length > 0) {
                  // scan through each entry and grab the latest update time
                  if (isSourceTypeObject && this._latestItemDatetime == null)
                     this._latestItemDatetime = data[0]["updated_at"];
                  for (const value of data)
                     if (
                        isSourceTypeObject &&
                        new Date(this._latestItemDatetime) <
                           new Date(value["updated_at"])
                     )
                        this._latestItemDatetime = value["updated_at"];
               }
               await this.processIncomingData(dcData);
               this._isSyncing = false;
               return;
            }
            default:
               // this means we are not initialized yet, so we need to load our data
               break;
         }
         // At this point, we have NOT loaded data from the server before:
         // if we are .initializing, then simply wait for it to be done
         // most likely we have called .loadData() before and it isn't complete.
         if (this._dataStatus === this.dataStatusFlag.initializing) {
            console.log(
               `ABDataCollection::loadData()::: initializing ${this.label} , ${this.id}`,
            );
            await Promise.all([
               // If this method has already been called, just wait for a response.
               await new Promise((resolve) => {
                  const waitForLoadingData = () => {
                     if (this._dataStatus === this.dataStatusFlag.initialized) {
                        resolve();
                        return;
                     }
                     setTimeout(() => {
                        waitForLoadingData();
                     }, TIME_WAIT);
                  };
                  waitForLoadingData();
               }),
            ]);
            return;
         }

         // mark data status is initializing
         if (this._dataStatus === this.dataStatusFlag.notInitial)
            this._dataStatus = this.dataStatusFlag.initializing;
         if (this.datasource == null) throw new Error("No datasource");
         if (backupDCData != null) {
            await this._saveDCData(backupDCData);
            this._isSyncing = false;
            return;
         }
         // if (this.model.object.id == "839ac470-8f77-420c-9a30-aeaf0a9f509c") {
         //    console.log(`Project .loadData()`);
         // }
         await this._saveDCData(
            await this.model.findAll(this._cond, {
               backupEvent: EVENT_KEY_BACKUP_CALL,
               backupMethod: EVENT_BACKUP_METHOD_LOADDATA,
               backupMethodArgs: [],
            }),
         );
         this._isSyncing = false;
      } catch (err) {
         await this._saveDCData({
            data: [],
            limit: 0,
            offset: 0,
            pos: 0,
            total_count: 0,
         });
         this._isSyncing = false;
         throw err;
      }
      try {
         await lock.acquire();
         await storage.set(refStorage, "status", "1");
         lock.release();
      } catch (err) {
         lock.release();
         throw err;
      }
   }

   deleteData(id) {
      const storage = this.AB.app.resources.storage;
      const refStorage = this.refStorage();
      const lock = this._lock;
      return new Promise((resolve, reject) => {
         (async () => {
            this._addInterruptingData(id);
            try {
               await lock.acquire();
               await Promise.all([
                  storage.clear(refStorage, id),
                  storage.set(
                     refStorage,
                     "total_count",
                     (this.__totalCount - 1).toString(),
                  ),
               ]);
               lock.release();
            } catch (err) {
               this._removeInterruptingData(id);
               lock.release();
               reject(err);
               return;
            }

            // TODO (Guy):
            const dcValues = this.getData((e) => e.id !== id);
            const dataStatus = this._dataStatus;
            try {
               this.__dataCollection.remove(id);
            } catch (err) {
               this.clearAll();
               if (dataStatus === this.dataStatusFlag.initialized)
                  this._dataStatus = dataStatus;
               dcValues.forEach((dcValue) => {
                  this.__dataCollection.add(dcValue);
               });
            }
            this.__totalCount--;
            resolve({ id });
            try {
               await this.model.delete(id);
               this.emit("updated");
               await Promise.all([
                  this.updateSyncData(),
                  this._updateSyncAffectedDCs(),
               ]);
               this._removeInterruptingData(id);
            } catch (err) {
               this._removeInterruptingData(id);
               console.error(err);
               this._analytics.logError(err);
               await new Promise((resolve) => {
                  this._page.f7App.dialog
                     .alert(`<t>${err.message}</t>`, "<t>Error</t>", () => {
                        resolve();
                     })
                     .open();
               });
            }
         })();
      });
   }

   async reloadData() {
      await this.reset();
      await this.loadData();
   }

   /**
    * reset
    * this is called when the App requires a hard reset().
    * Our job is to clear out any data we are storing to a new, uninitialized
    * state.
    * @return {Promise}
    */
   async reset(force = false) {
      this.clearAll();
      if (!force) return;
      const lock = this._lock;
      try {
         await lock.acquire();
         const storage = this.AB.app.resources.storage;
         const refStorage = this.refStorage();
         await storage.clearAll(refStorage);
         await storage.set(refStorage, "status", "0");
         this._latestItemDatetime = null;
         lock.release();
      } catch (err) {
         lock.release();
         throw err;
      }
   }

   setData(id, value) {
      // if not valid for this DC
      if (!this.__filterDatasource.isValid(value))
         throw Error("Some value is not valid!");
      const app = this.AB.app;
      const storage = app.resources.storage;
      const lock = this._lock;
      return new Promise((resolve, reject) => {
         (async () => {
            // UPDATE Operation
            if (id != null) {
               this._addInterruptingData(id);
               const newValue = {
                  data: value,
                  id,
                  isConfirmed: false,
               };
               // 1) Store unconfirmed version of value in local storage
               try {
                  await lock.acquire();
                  await storage.set(this.refStorage(), id, newValue);
                  lock.release();
               } catch (err) {
                  this._removeInterruptingData(id);
                  lock.release();
                  reject(err);
                  return;
               }

               // TODO (Guy):
               // 2) update the DC with the new value
               const dcValues = this.getData();
               const dataStatus = this._dataStatus;
               try {
                  (!this.__dataCollection.exists(id) &&
                     this.__dataCollection.add(newValue)) ||
                     this.__dataCollection.updateItem(id, newValue);
               } catch (err) {
                  this.clearAll();
                  if (dataStatus === this.dataStatusFlag.initialized)
                     this._dataStatus = dataStatus;
                  dcValues.forEach((dcValue) => {
                     this.__dataCollection.add(dcValue);
                  });
                  (!this.__dataCollection.exists(id) &&
                     this.__dataCollection.add(newValue)) ||
                     this.__dataCollection.updateItem(id, newValue);
               }

               // 3) if the external code is not awaiting us, then
               //    respond quickly with a usable newValue
               //    && behind the scenes
               resolve(newValue);
               try {
                  const result = await this.model.update(id, value);
                  await Promise.all([
                     this.updateSyncData({
                        data: [result],
                     }),
                     this._updateSyncAffectedDCs(),
                  ]);
                  this._removeInterruptingData(id);
               } catch (err) {
                  this._removeInterruptingData(id);
                  console.error(err);
                  this._analytics.logError(err);
                  await new Promise((resolve) => {
                     this._page.f7App.dialog
                        .alert(`<t>${err.message}</t>`, "<t>Error</t>", () => {
                           resolve();
                        })
                        .open();
                  });
               }
               this.emit("updated");
               return;
            }

            // ADD Operation
            const newID = app.utils.uuidv4();
            this._addInterruptingData(newID);
            const newData = Object.assign({}, value, {
               id: newID,
               uuid: newID,
            });
            const newValue = {
               data: newData,
               id: newID,
               isConfirmed: false,
            };

            // 1) Store data locally
            try {
               await lock.acquire();
               await storage.set(this.refStorage(), newID, newValue);
               lock.release();
            } catch (err) {
               this._removeInterruptingData(newID);
               lock.release();
               reject(err);
               return;
            }

            // TODO (Guy): Sometimes this gets an error. To reproduce, add data continuously until you get an error.
            // TODO (Guy): This is temporary fix.
            // 2) update our DataCollection with newValue
            const dcValues = this.getData();
            const dataStatus = this._dataStatus;
            try {
               (!this.__dataCollection.exists(newID) &&
                  this.__dataCollection.add(newValue)) ||
                  this.__dataCollection.updateItem(newID, newValue);
            } catch (err) {
               this.clearAll();
               if (dataStatus === this.dataStatusFlag.initialized)
                  this._dataStatus = dataStatus;
               dcValues.forEach((dcValue) => {
                  this.__dataCollection.add(dcValue);
               });
               (!this.__dataCollection.exists(newID) &&
                  this.__dataCollection.add(newValue)) ||
                  this.__dataCollection.updateItem(newID, newValue);
            }
            resolve(newValue);
            try {
               const result = await this.model.create(newData);
               await Promise.all([
                  this.updateSyncData({
                     data: [result],
                  }),
                  this._updateSyncAffectedDCs(),
               ]);
               this._removeInterruptingData(newID);
            } catch (err) {
               this._removeInterruptingData(newID);
               console.error(err);
               this._analytics.logError(err);
               await new Promise((resolve) => {
                  this._page.f7App.dialog
                     .alert(`<t>${err.message}</t>`, "<t>Error</t>", () => {
                        resolve();
                     })
                     .open();
               });
            }
            this.emit("updated");
         })();
      });
   }

   async updateSyncData(backupDcData) {
      const lock = this._lock;
      if (!lock) {
         this._analytics.logError(
            "Attempt to update/sync dataCollection, it may not be initialized: ",
            this,
         );
         return;
         // ? Instead of throwing error, should a table be initialized?
         // this._lock = new AB.app.utils.Lock();
      }
      const storage = this.AB.app.resources.storage;
      const refStorage = this.refStorage();
      let status = 0;
      try {
         await lock.acquire();
         status = await storage.get(refStorage, "status");
         lock.release();
      } catch (err) {
         lock?.release();
         throw err;
      }
      switch (status) {
         case 1:
            if (this._dataStatus === this.dataStatusFlag.initialized) break;
            return;
         default:
            break;
      }
      const isSourceTypeObject = this.sourceType === "object";
      const saveData = async (dcData) => {
         let pendingPromises = [];
         const lock = this._lock;
         try {
            await lock.acquire();
            for (let value of dcData.data) {
               pendingPromises.push(
                  (async () => {
                     if (
                        isSourceTypeObject &&
                        new Date(this._latestItemDatetime) <
                           new Date(value["updated_at"])
                     )
                        this._latestItemDatetime = value["updated_at"];
                     const key =
                        (typeof value.id === "string" && value.id) ||
                        value.id.toString();
                     value = {
                        data: value,
                        id: key,
                        isConfirmed: true,
                     };
                     // if not there, add it
                     if ((await storage.get(refStorage, key)) == null) {
                        // add it locally
                        await Promise.all([
                           storage.set(refStorage, key, value),
                           storage.set(
                              refStorage,
                              "total_count",
                              (this.__totalCount + 1).toString(),
                           ),
                        ]);

                        // TODO (Guy):
                        // add it to DC / or update it
                        const dcValues = this.getData();
                        const dataStatus = this._dataStatus;
                        try {
                           (!this.__dataCollection.exists(key) &&
                              this.__dataCollection.add(value)) ||
                              this.__dataCollection.updateItem(key, value);
                        } catch (err) {
                           this.clearAll();
                           if (dataStatus === this.dataStatusFlag.initialized)
                              this._dataStatus = dataStatus;
                           dcValues.forEach((dcValue) => {
                              this.__dataCollection.add(dcValue);
                           });
                           (!this.__dataCollection.exists(key) &&
                              this.__dataCollection.add(value)) ||
                              this.__dataCollection.updateItem(key, value);
                        }
                        this.__totalCount++;
                        return;
                     }
                     // else update existing entry
                     await storage.set(refStorage, key, value);

                     // TODO (Guy):
                     const dcValues = this.getData();
                     const dataStatus = this._dataStatus;
                     try {
                        (!this.__dataCollection.exists(key) &&
                           this.__dataCollection.add(value)) ||
                           this.__dataCollection.updateItem(key, value);
                     } catch (err) {
                        this.clearAll();
                        if (dataStatus === this.dataStatusFlag.initialized)
                           this._dataStatus = dataStatus;
                        dcValues.forEach((dcValue) => {
                           this.__dataCollection.add(dcValue);
                        });
                        (!this.__dataCollection.exists(key) &&
                           this.__dataCollection.add(value)) ||
                           this.__dataCollection.updateItem(key, value);
                     }
                  })(),
               );

               // Wait for 100 promises each time.
               if (pendingPromises.length < PENDING_PROMISE_LIMIT) continue;
               await Promise.all(pendingPromises);
               pendingPromises = [];
            }
            pendingPromises.length > 0 && (await Promise.all(pendingPromises));
            pendingPromises = null;
            lock.release();
         } catch (err) {
            lock.release();
            throw err;
         }
      };
      if (backupDcData != null) {
         if (this._isSyncing) await this._waitForSync();
         await saveData(backupDcData);
         this.emit("updated");
         return;
      } else if (this._isSyncing) {
         await this._waitForSync();
         return;
      }
      this._isSyncing = true;
      try {
         if (!isSourceTypeObject) {
            await this._saveDCData(
               await this.model.findAll(this._cond, {
                  backupEvent: EVENT_KEY_BACKUP_CALL,
                  backupMethod: EVENT_BACKUP_METHOD_UPDATE_SYNC_DATA,
                  backupMethodArgs: [],
               }),
            );
            this._isSyncing = false;
            this.emit("updated");
            return;
         }

         // TODO (Guy): Fix the force sync all in the future.
         if (this._latestItemDatetime != null || true) {
            await this._saveDCData(
               await this.model.findAll(this._cond, {
                  backupEvent: EVENT_KEY_BACKUP_CALL,
                  backupMethod: EVENT_BACKUP_METHOD_UPDATE_SYNC_DATA,
                  backupMethodArgs: [],
               }),
            );
            this._isSyncing = false;
            this.emit("updated");
            return;
         }
         const cond = structuredClone(this._cond);
         const where = cond.where || {};
         if (where.glue == null) where.glue = "and";
         if (where.rules == null) where.rules = [];
         if (where.glue === "or") {
            where.rules = [structuredClone(where)];
            where.glue = "and";
         }
         where.rules.push({
            key: "updated_at",
            rule: "greater",
            value: moment(new Date(this._latestItemDatetime).toISOString())
               .utc()
               .format("YYYY-MM-DD HH:mm:ss"),
         });
         await saveData(
            await this.model.findAll(cond, {
               backupEvent: EVENT_KEY_BACKUP_CALL,
               backupMethod: EVENT_BACKUP_METHOD_UPDATE_SYNC_DATA,
               backupMethodArgs: [],
            }),
         );
         this._isSyncing = false;
         this.emit("updated");
      } catch (err) {
         this._isSyncing = false;
         throw err;
      }
   }

   /**
    * refStorage
    * return a unique key for this datacollection for our storage key.
    * we will store information about our DC here like:
    *      "bootState" :  [ "uninitialized", "initialized" ]
    * @return {string}
    */
   refStorage() {
      return `dc-${this.id}`;
   }
   /**
    * keyPrefix
    * return the key needed to access the storage for this datacollection.
    *      "bootState" :  [ "uninitialized", "initialized" ]
    * @return {string}
    */
   keyPrefix() {
      return `meta-dc-${this.id}-`;
   }

   get model() {
      return (
         this._model ||
         (this._model = (() => {
            const model = super.model;
            model.contextKey(
               this.AB.app.resources.network.defaultEventKeys.callback,
            );
            model.contextValues({
               targetEventKey: EVENT_KEY_MODEL,
               targetEventPath: EVENT_PATH.replace(":id", this.id),
            });
            return model;
         })())
      );
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
   processIncomingData(data) {
      return Promise.resolve().then(() => {
         // store total count
         this.__totalCount = data.total_count;

         // Need to .parse at the first time
         if (!this.__dataCollection.find({}).length) {
            this.__dataCollection.clearAll();
            // this.__dataCollection.parse(data);
         }

         if (this.__throttleIncoming) clearTimeout(this.__throttleIncoming);
         this.__throttleIncoming = setTimeout(async () => {
            // In order to get the total_count updated I had to use .load()
            this.__dataCollection.load(() => {
               // setTimeout(() => {
               //    this.refreshLinkCursor();
               // }, 250);

               return {
                  // NOTE: return a empty array to prevent render items in DataTable twice. (Items are rendered in .queuedParse function)
                  data: data.data,
                  pos: data.pos,
                  total_count: data.total_count,
               };
            });

            // using queuedParse() to responsively handle large datasets.
            // await this.queuedParse(data);

            // this does nothing???
            this.parseTreeCollection(data);

            // if we are linked, then refresh our cursor
            var linkDv = this.datacollectionLink;
            if (linkDv) {
               // filter data by match link data collection
               this.refreshLinkCursor();
               this.setStaticCursor();
            } else {
               // set static cursor
               this.setStaticCursor();
            }

            // now we close out our .loadData() promise.resolve() :
            if (this._pendingLoadDataResolve) {
               this._pendingLoadDataResolve.resolve();

               // after we call .resolve() stop tracking this:
               this._pendingLoadDataResolve = null;
            }

            // If dc set load all, then it will not trigger .loadData in dc at
            // .onAfterLoad event
            if (this.settings.loadAll) {
               this.emit("loadData", {});
            }

            // mark initialized data
            if (this._dataStatus != this.dataStatusFlag.initialized) {
               this._dataStatus = this.dataStatusFlag.initialized;
               this.emit("initializedData", {});
            }
         }, 100);
      });
   }
};
