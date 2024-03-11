/**
 * ABModel
 *
 * This is the platform dependent implementation of an ABModel.
 *
 */

const ABModelCore = require("../core/ABModelCore");
const ABModelLocal = require("./ABModelLocal");
const ABModelRelay = require("./ABModelRelay");

module.exports = class ABModel extends ABModelCore {
   /**
    * @method _reloadAffectedDC
    * Reload affected datacollections.
    * @return {Promise}
    */
   async _reloadAffectedDC() {
      const affectedOBJs = this.object
         .connectFields()
         .map((field) => field.datasourceLink.id)
         .concat(this.object.id);
      await Promise.all(
         this.AB.datacollections((datacollection) =>
            affectedOBJs.includes(datacollection.datasource.id),
         ).map((datacollection) => datacollection.loadData()),
      );
   }

   /**
    * @method local
    * get a ABModelLocal instance.
    * @return {ABModelLocal}
    */
   local() {
      const newModel = new ABModelLocal(this.object);
      newModel.contextKey(this.responseContext.key);
      newModel.contextValues(this.responseContext.context);
      return newModel;
   }

   /**
    * @method relay
    * get a ABModelRelay instance.
    * @return {ABModelRelay}
    */
   relay() {
      const newModel = new ABModelRelay(this.object);
      newModel.contextKey(this.responseContext.key);
      newModel.contextValues(this.responseContext.context);
      return newModel;
   }

   /**
    * @method remote
    * get a ABModelRelay instance.
    * @return {ABModelRelay}
    */
   remote() {
      // TODO: look at project settings and determine which
      // type of remote link we will use:
      return this.relay();
   }

   /**
    * @method create
    * update model values on the server.
    * @param {obj} values  the values to create.
    * @return {Promise}
    */
   async create(values) {
      const copiedValues = structuredClone(values) || {};
      this.prepareMultilingualData(copiedValues);

      // make sure any values we create have a UUID field set:
      const UUID = this.object.fieldUUID(copiedValues);
      if (copiedValues[UUID] == null) copiedValues[UUID] = this.AB.uuid();
      await this.remote().create(copiedValues);
      await this.local().create(copiedValues);
      this.object.emit("CREATE", copiedValues);
      await this._reloadAffectedDC();
   }
   /**
    * @method createLocalPriority
    * create model values locally, then send to server without waiting.
    * @param {obj} values  the values to create.
    * @return {Promise}
    */
   async createLocalPriority(values) {
      const copiedValues = structuredClone(values) || {};
      this.prepareMultilingualData(copiedValues);

      // make sure any values we create have a UUID field set:
      const UUID = this.object.fieldUUID(copiedValues);
      if (copiedValues[UUID] == null) copiedValues[UUID] = this.AB.uuid();
      
      // we'll return before the remote call is complete.
      this.remote().create(copiedValues);

      await this.local().create(copiedValues);
      this.object.emit("CREATE", copiedValues);
      await this._reloadAffectedDC();
   }

   /**
    * @method delete
    * remove this model instance from from our local and remote storage
    * @param {string} id  the .uuid of the instance to remove.
    * @return {Promise}
    */
   async delete(id) {
      await this.remote().delete(id);

      // delete from our local storage
      await this.local().delete(id);
      this.object.emit("DELETE", id);
      await this._reloadAffectedDC();
   }

   /**
    * @method findAll
    * performs a data find with the provided condition.
    * @return {Promise}
    */
   findAll(cond) {
      return this.local().findAll(cond);
   }

   /**
    * @method update
    * update model values on the server.
    * @return {Promise}
    */
   async update(id, values) {
      const copiedValues = structuredClone(values) || {};
      this.prepareMultilingualData(copiedValues);

      // remove empty properties
      Object.keys(copiedValues).forEach((key) => {
         if (key.includes("__relation") || copiedValues[key] == null)
            delete copiedValues[key];
      });
      await this.remote().update(id, copiedValues);
      await this.local().update(id, copiedValues);
      this.object.emit("UPDATE", copiedValues);
   }
};
