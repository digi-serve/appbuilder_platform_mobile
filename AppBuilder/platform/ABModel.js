/**
 * ABModel
 *
 * This is the platform dependent implementation of an ABModel.
 *
 */

const ABModelCore = require("../core/ABModelCore");

module.exports = class ABModel extends ABModelCore {
   /**
    * @method _processRequest
    * process remote request.
    * @param {string} method the http request method (get, post, put or delete).
    * @param {Object} params  request parameters.
    * @param {Object} responseContext  context parameters.
    * @return {Promise}
    */
   _processRequest(method, params, responseContext) {
      const copiedResponseContext = structuredClone(responseContext);
      return new Promise((resolve, reject) => {
         copiedResponseContext.context.callback = async (err, result) => {
            if (err != null) {
               err["info"] = {
                  method,
                  params,
                  responseContext,
                  result,
               };
               reject(new Error(err.message));
               return;
            }
            resolve(result);
         };
         (async () => {
            await this.AB.app.resources.network[method](params, copiedResponseContext);
         })();
      });
   }

   /**
    * @method create
    * update model values on the server.
    */
   create(value) {
      this.prepareMultilingualData(value);
      return this._processRequest(
         "post",
         this.urlParamsCreate(value),
         this.responseContext
      );
   }

   /**
    * @method delete
    * remove this model instance from the server
    * @param {integer} id  the .id of the instance to remove.
    * @return {Promise}
    */
   delete(id) {
      // The data returned from a .delete operation doesn't contain the .id
      // for the item being deleted.  So store it as part of the context
      // and the ABObject will know to use that if it is available.
      this.responseContext.context.pk = id;
      return this._processRequest(
         "delete",
         this.urlParamsDelete(id),
         this.responseContext
      );
   }

   /**
    * @method findAll
    * performs a data find with the provided condition.
    */
   findAll(cond) {
      const copiedCond = structuredClone(cond);
      copiedCond.where = copiedCond.where || { glue: "and", rules: [] };
      copiedCond.where.glue = copiedCond.where.glue || "and";
      copiedCond.where.rules =
         (Array.isArray(copiedCond.where.rules) && copiedCond.where.rules) ||
         [];

      // Tell the server to get the fully populated relation data
      // This the old format, no longer giving by default for performance reasons
      copiedCond.disableMinifyRelation = true;
      return this._processRequest(
         "get",
         this.urlParamsFind(copiedCond),
         this.responseContext
      );
   }

   /**
    * @method update
    * update model values on the server.
    */
   update(id, value) {
      const copidData = structuredClone(value);

      // remove empty properties
      for (const key in copidData)
         if (copidData[key] == null) delete copidData[key];
      this.prepareMultilingualData(copidData);
      return this._processRequest(
         "put",
         this.urlParamsUpdate(id, copidData),
         this.responseContext
      );
   }
};
