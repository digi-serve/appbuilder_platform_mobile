/**
 * ABDataCollection
 *
 * This is the platform dependent implementation of ABObject.
 *
 */

const ABDataCollectionCore = require("../core/ABDataCollectionCore");

const EVENT_KEY_MODEL = "model";
const EVENT_KEY_BACKUP_CALL = "backupCall";
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
      this._latestItemDatetime = null;
      this._lock = null;
      this._model = null;
      this._isSyncing = false;
      this._hasInitStarted = false;
      this.on(
         EVENT_KEY_BACKUP_CALL,
         async (backupMethod, newBackupMethodArgs) => {
            try {
               const result = this[backupMethod](...newBackupMethodArgs);
               result instanceof Promise && (await result);
            } catch (err) {
               console.error(err);
            }
         },
      );
      this.on(EVENT_KEY_MODEL, (context, res, instance) => {
         this.model.dataCallback(context, res, instance);
      });
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
            const keyPrefix = this.keyPrefix();
            switch (key) {
               case "data":
                  const data = dcData[key];
                  if (data.length === 0) break;
                  const isSourceTypeObject = this.sourceType === "object";
                  if (isSourceTypeObject && this._latestItemDatetime == null)
                     this._latestItemDatetime = data[0]["updated_at"];
                  for (const value of data) {
                     if (
                        isSourceTypeObject &&
                        new Date(this._latestItemDatetime) <
                           new Date(value["updated_at"])
                     )
                        this._latestItemDatetime = value["updated_at"];
                     pendingPromises.push(
                        storage.set(refStorage, value.id, value),
                     );

                     // Wait for 100 promises each time.
                     if (pendingPromises.length < PENDING_PROMISE_LIMIT)
                        continue;
                     await Promise.all(pendingPromises);
                     pendingPromises = [];
                  }
                  break;
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
      await this.processIncomingData(dcData);
      await pendingLoadData;
   }

   /**
    * @method _updateSyncAffectedDCs
    * Reload affected datacollections.
    * @return {Promise}
    */
   async _updateSyncAffectedDCs() {
      console.assert(this.AB.app.abDCs, "this.AB.app.abDCs not defined");//
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

   async loadData(backupDCData) {
      const lock = this._lock;
      const storage = this.AB.app.resources.storage;
      const refStorage = this.refStorage();
      try {
         if (this._isSyncing) {
            await this._waitForSync();
            return;
         }
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
            case 1:
               if (this._dataStatus === this.dataStatusFlag.initialized) {
                  this._isSyncing = false;
                  console.log(`ABDataCollection::loadData()::: initialized ${this.label} , ${this.id}`);
                  return;
               }
               const dcData = await this._getDCData();
               const data = dcData.data;
               const isSourceTypeObject = this.sourceType === "object";
               if (data.length > 0) {
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
            default:
               // this means we are not initialized yet, so we need to load our data
               break;
         }
         if (this._dataStatus === this.dataStatusFlag.initializing) {
            console.log(`ABDataCollection::loadData()::: initializing ${this.label} , ${this.id}`);
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
         await this._saveDCData(
            await this.model.findAll(this._cond, {
               backupEvent: "backupCall",
               backupMethod: "loadData",
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

   async deleteData(id, callback) {
      await this.model.delete(id);
      const storage = this.AB.app.resources.storage;
      const refStorage = this.refStorage();
      const lock = this._lock;
      try {
         await lock.acquire();
         await Promise.all([
            storage.clear(refStorage, id),
            storage.set(
               refStorage,
               "total_count",
               (this.__totalCount - 1).toString(),
            ),
            this._updateSyncAffectedDCs(),
         ]);
         lock.release();
      } catch (err) {
         lock.release();
         throw err;
      }
      this.__dataCollection.remove(id);
      this.__totalCount = this.__totalCount - 1;
      if (callback == null) return id;
      const callbackResult = callback(id);
      callbackResult instanceof Promise && (await callbackResult);
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

   async setData(id, value, callback) {
      // if not valid for this DC
      if (!this.__filterDatasource.isValid(value)) return;

      const result =
         (id != null && (await this.model.update(id, value))) ||
         (await this.model.create(value));
      await Promise.all([
         this._updateSyncAffectedDCs(),
         this.updateSyncData({
            data: [result],
         }),
      ]);
      if (callback == null) return resData;
      const callbackResult = callback(result);
      callbackResult instanceof Promise && (await callbackResult);
   }

   async updateSyncData(backupDcData) {
      if (this._isSyncing) {
         await this._waitForSync();
         return;
      }
      this._isSyncing = true;
      const lock = this._lock;
      const storage = this.AB.app.resources.storage;
      const refStorage = this.refStorage();
      let status = 0;
      try {
         await lock.acquire();
         status = await storage.get(refStorage, "status");
         lock.release();
      } catch (err) {
         lock.release();
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
            for (const value of dcData.data) {
               pendingPromises.push(
                  (async () => {
                     const id = value.id;
                     const key =
                        (typeof id === "string" && id) || id.toString();
                     if ((await storage.get(refStorage, key)) == null) {
                        await Promise.all([
                           storage.set(refStorage, key, value),
                           storage.set(
                              refStorage,
                              "total_count",
                              (this.__totalCount + 1).toString(),
                           ),
                        ]);
                        this.__dataCollection.add(value);
                        this.__totalCount = this.__totalCount + 1;
                     } else {
                        await storage.set(refStorage, key, value);
                        const oldValue = this.getData((e) => e.key === key)[0];
                        (oldValue == null &&
                           this.__dataCollection.add(value)) ||
                           this.__dataCollection.updateItem(key, value);
                     }
                     if (
                        isSourceTypeObject &&
                        new Date(this._latestItemDatetime) <
                           new Date(value["updated_at"])
                     )
                        this._latestItemDatetime = value["updated_at"];
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
         try {
            await saveData(backupDcData);
            this._isSyncing = false;
            return;
         } catch (err) {
            this._isSyncing = false;
            throw err;
         }
      }
      try {
         if (!isSourceTypeObject) {
            await saveData(
               await this.model.findAll(this._cond, {
                  backupEvent: "backupCall",
                  backupMethod: "updateSyncData",
                  backupMethodArgs: [],
               }),
            );
            this._isSyncing = false;
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
         const rules = where.rules;
         if (this._latestItemDatetime == null)
            rules.push({
               key: "updated_at",
               rule: "less_or_equal",
               value: moment(new Date().toISOString())
                  .utc()
                  .format("YYYY-MM-DD HH:mm:ss"),
            });
         else
            rules.push({
               key: "updated_at",
               rule: "greater",
               value: moment(new Date(this._latestItemDatetime).toISOString())
                  .utc()
                  .format("YYYY-MM-DD HH:mm:ss"),
            });
         await saveData(
            await this.model.findAll(cond, {
               backupEvent: "backupCall",
               backupMethod: "updateSyncData",
               backupMethodArgs: [],
            }),
         );
         this._isSyncing = false;
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
      console.assert(this.id, "ABDataCollection::refStorage(): missing id");
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
};
