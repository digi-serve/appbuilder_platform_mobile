/**
 * ABModel
 *
 * This is the platform dependent implementation of an ABModel.
 *
 */

const ABModelCore = require("../core/ABModelCore");
const EventEmitter = require("eventemitter2");
const EVENT_KEY_DATA_CALLBACK = "dataCallback";

module.exports = class ABModel extends ABModelCore {
   constructor(object) {
      super(object);
      this._callbackQueues = [];
      const modelEvent = new EventEmitter();
      modelEvent.on(EVENT_KEY_DATA_CALLBACK, async (context, res, instance) => {
         const callbackQueues = this._callbackQueues;
         const callbackQueue = callbackQueues.splice(
            callbackQueues.findIndex(
               (callbackQueue) => callbackQueue.id === context.queueUUID
            ),
            1
         )[0];
         const data = res.data;
         if (res.status === "error") {
            const resErr = new Error(res.message);
            if (callbackQueue == null) {
               console.error(resErr);
               return;
            }
            const callbackResult = callbackQueue.callback(resErr);
            callbackResult instanceof Promise && (await callbackResult);
            return;
         }
         if (callbackQueue == null) {
            try {
               if (instance == null) throw new Error("No instance");
               instance.emit(context.backupEvent, context.backupMethod, [
                  ...context.backupMethodArgs,
                  data,
               ]);
            } catch (err) {
               console.error(err);
            }
            return;
         }
         const callbackResult = callbackQueue.callback(null, data);
         callbackResult instanceof Promise && (await callbackResult);
      });
      this._modelEvent = modelEvent;
   }

   /**
    * @method _processRequest
    * process remote request.
    * @param {string} method the http request method (get, post, put or delete).
    * @param {Object} params  request parameters.
    * @param {Object} responseContext  context parameters.
    * @return {Promise}
    */
   _processRequest(method, params, responseContext, options) {
      const copiedResponseContext = structuredClone(responseContext);
      const context = copiedResponseContext.context;
      return new Promise((resolve, reject) => {
         context.queueUUID = this.object.AB.app.utils.uuidv4();
         if (options.backupMethod != null) {
            context.backupMethod = options.backupMethod;
            context.backupMethodArgs = options.backupMethodArgs;
         }
         this._callbackQueues.push({
            id: context.queueUUID,
            callback: (err, result) => {
               if (err != null) {
                  reject(err);
                  return;
               }
               resolve(result);
            },
         });
         (async () => {
            await this.AB.app.resources.network[method](
               params,
               copiedResponseContext
            );
         })();
      });
   }

   /**
    * @method create
    * update model values on the server.
    */
   create(value, options = {}) {
      this.prepareMultilingualData(value);
      return this._processRequest(
         "post",
         this.urlParamsCreate(value),
         this.responseContext,
         options
      );
   }

   dataCallback(context, res, instance) {
      this._modelEvent.emit(EVENT_KEY_DATA_CALLBACK, context, res, instance);
   }

   /**
    * @method delete
    * remove this model instance from the server
    * @param {integer} id  the .id of the instance to remove.
    * @return {Promise}
    */
   delete(id, options = {}) {
      // The data returned from a .delete operation doesn't contain the .id
      // for the item being deleted.  So store it as part of the context
      // and the ABObject will know to use that if it is available.
      this.responseContext.context.pk = id;
      return this._processRequest(
         "delete",
         this.urlParamsDelete(id),
         this.responseContext,
         options
      );
   }

   /**
    * @method findAll
    * performs a data find with the provided condition.
    */
   findAll(cond, options = {}) {
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
         this.responseContext,
         options
      );
   }

   /**
    * @method update
    * update model values on the server.
    */
   update(id, value, options = {}) {
      const copidData = structuredClone(value);

      // remove empty properties
      for (const key in copidData)
         if (copidData[key] == null) delete copidData[key];
      this.prepareMultilingualData(copidData);
      return this._processRequest(
         "put",
         this.urlParamsUpdate(id, copidData),
         this.responseContext,
         options
      );
   }
};
