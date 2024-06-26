/**
 * ABDataCollection
 *
 * This is the platform dependent implementation of ABObject.
 *
 */

const { storage } = require("../../resources/Storage");
const ABDataCollectionCore = require("../core/ABDataCollectionCore");

module.exports = class ABDataCollection extends ABDataCollectionCore {
   constructor(attributes, AB) {
      super(attributes, AB);
      this._model = null;

      // Setup a listener for this DC to catch updates from the remote request.
      this.on("", () => {});
      this.AB.app.resources.network.on(
         this.refStorage(),
         async (context, res) => {
            console.log(":: name:", this.name, {
               ":: context:": context,
               ":: data:": res.data,
            });
            if (context.callback == null) return;
            const callbackResult =
               (context.error != null && context.callback?.(context.error)) ||
               context.callback?.(null, data);
            try {
               if (callbackResult instanceof Promise) await callbackResult;
            } catch (err) {
               context.callback?.(err);
            }
         }
      );
      this.on("xx", () => {
         debugger;
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
               }
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

   /**
    * @method _reloadAffectedDC
    * Reload affected datacollections.
    * @return {Promise}
    */
   async _reloadAffectedDC() {
      await Promise.all(
         this.AB.datacollections((dc) =>
            this.datasource
               .connectFields()
               .map((field) => field.datasourceLink.id)
               .concat(this.datasource.id)
               .includes(dc.datasource.id)
         ).map((dc) => dc.loadData(true))
      );
   }

   async init() {
      super.init();

      // TODO (Guy): Refactor.
      await this.reset(true);
      await this.loadData(true);
      // await this.reloadData();
   }

   async loadData(sync = false) {
      if (
         this._dataStatus === this.dataStatusFlag.initializing ||
         this._dataStatus === this.dataStatusFlag.initialized
      )
         return;
      let dcData = {
         data: [],
         limit: 0,
         offset: 0,
         pos: 0,
         total_count: 0,
      };
      // mark data status is initializing
      if (this._dataStatus === this.dataStatusFlag.notInitial)
         this._dataStatus = this.dataStatusFlag.initializing;
      const obj = this.datasource;
      if (obj == null) {
         await this.processIncomingData(dcData);
         return;
      }
      const AB = this.AB;
      const storage = AB.app.resources.storage;
      if (!sync) {
         await Promise.all([
            (async () => {
               const key = "limit";
               dcData[key] =
                  parseInt(await storage.get(this.refStorage(), key)) ||
                  dcData[key];
            })(),
            (async () => {
               const key = "offset";
               dcData[key] =
                  parseInt(await storage.get(this.refStorage(), key)) ||
                  dcData[key];
            })(),
            (async () => {
               const key = "pos";
               dcData[key] =
                  parseInt(await storage.get(this.refStorage(), key)) ||
                  dcData[key];
            })(),
            (async () => {
               const key = "total_count";
               dcData[key] =
                  parseInt(await storage.get(this.refStorage(), key)) ||
                  dcData[key];
            })(),
            (async () => {
               // TODO (Guy): Fix this logic later to use IndexDB's filter.
               dcData.data = (await storage.getAll(this.refStorage())).filter(
                  (value) => value instanceof Object
               );
            })(),
         ]);
         await this.processIncomingData(dcData);
         return;
      }

      // pull the defined sort values
      const sorts = this.settings.objectWorkspace.sortFields || [];

      // pull filter conditions
      let wheres = AB.cloneDeep(
         this.settings.objectWorkspace.filterConditions || {}
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
      wheres = obj.whereCleanUp(wheres);

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
                  this.waitForDataCollectionToInitialize(dc)
               );
            }
         }
      });
      if (pendingRelatedRuleDC.length > 0)
         await Promise.all(pendingRelatedRuleDC);

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

      // TODO (Guy): Johnny is including all dc info.
      dcData = (await this.model.findAll(cond)).data;
      let pendingPromises = [];
      for (const key in dcData) {
         switch (key) {
            case "data":
               for (const value of dcData.data) {
                  pendingPromises.push(
                     storage.set(this.refStorage(), value.uuid, value)
                  );

                  // Wait for 100 promises each time.
                  if (pendingPromises.length < 100) continue;
                  await Promise.all(pendingPromises);
                  pendingPromises = [];
               }
               break;
            default:
               pendingPromises.push(
                  storage.set(this.refStorage(), key, dcData[key].toString())
               );
               break;
         }
      }
      pendingPromises.length > 0 && (await Promise.all(pendingPromises));
      pendingPromises = null;
      await this.processIncomingData(dcData);
      await pendingLoadData;
   }

   async deleteData(id, waitForSync = true) {
      const pendingSyncData = this.model.delete(id);
      waitForSync && (await pendingSyncData);
      this.__dataCollection.remove(id);
      await this.AB.app.resources.storage.clear(this.refStorage(), id);
      this.__totalCount--;
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
      force &&
         (await this.AB.app.resources.storage.clearAll(this.refStorage()));
   }

   async setData(id, value, waitForSync = true) {
      // if not valid for this DC
      if (!this.__filterDatasource.isValid(value)) return;

      const copidData = structuredClone(value);
      const storage = this.AB.app.resources.storage;
      if (id == null) {
         const pendingSyncData = this.model.create(copidData);
         const newValue =
            (waitForSync && (await pendingSyncData).data) ||
            (() => {
               copidData["created_at"] = new Date();
               copidData["updated_at"] = new Date();
               this.model.prepareMultilingualData(copidData);
               return copidData;
            })();
         await storage.set(this.refStorage(), id, newValue);
         this.__dataCollection.add(newValue);
         this.__totalCount = this.__totalCount + 1;
         return;
      }
      const pendingSyncData = this.model.update(id, copidData);
      const newValue =
         (waitForSync && (await pendingSyncData).data) ||
         (() => {
            copidData["updated_at"] = new Date();
            this.model.prepareMultilingualData(copidData);
            return copidData;
         })();
      await storage.set(this.refStorage(), id, newValue);
      this.__dataCollection.updateItem(id, newValue);
   }

   async updateSyncData() {

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

   get model() {
      return (
         this._model ||
         (this._model = (() => {
            const model = super.model;
            model.contextKey(this.refStorage());
            return model;
         })())
      );
   }
};
