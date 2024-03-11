/**
 * ABModelRelay
 *
 * This ABModel performs it's actions using the ABRelay communications
 * channel.
 *
 */

// const { values } = require("lodash");
const ABModelCore = require("../core/ABModelCore");

module.exports = class ABModelRelay extends ABModelCore {
   /**
    * @method processRequest
    * process remote request.
    * @param {string} method the http request method (get, post, put or delete).
    * @param {obj} params  request parameters.
    * @param {obj} responseContext  context parameters.
    * @return {Promise}
    */
   processRequest(method, params, responseContext) {
      const newResponseContext = Object.assign({}, responseContext);
      return new Promise((resolve, reject) => {
         newResponseContext.context.callback = async (err, result) => {
            if (err != null){
               err["info"] = {
                  method,
                  params,
                  responseContext,
                  result,
               };
               reject(new Error(err.message));
            } 
            resolve(result);
         };
         (async () => {
            await this.AB.network[method](params, newResponseContext);
         })();
      });
   }

   /**
    * @method create
    * update model values on the server.
    */
   create(values) {
      this.prepareMultilingualData(values);

      // make sure any values we create have a UUID field set:
      const UUID = this.object.fieldUUID(values);
      if (!values[UUID]) values[UUID] = this.AB.uuid();
      // fire off a Relay Request to create this on the server too:
      this.responseContext.context.verb = "create";
      return this.processRequest(
         "post",
         this.urlParamsCreate(values),
         this.responseContext,
      );
   }

   /**
    * @method delete
    * remove this model instance from the server
    * @param {integer} id  the .id of the instance to remove.
    * @return {Promise}
    */
   delete(id) {
      // fire off a Relay Request to delete this on the server too:
      this.responseContext.context.verb = "delete";

      // The data returned from a .delete operation doesn't contain the .id
      // for the item being deleted.  So store it as part of the context
      // and the ABObject will know to use that if it is available.
      this.responseContext.context.pk = id;
      return this.processRequest(
         "delete",
         this.urlParamsDelete(id),
         this.responseContext,
      );
   }

   /**
    * @method findAll
    * performs a data find with the provided condition.
    */
   findAll(cond) {
      cond = cond || {};
      // Tell the server to get the fully populated relation data
      // This the old format, no longer giving by default for performance reasons
      cond.disableMinifyRelation = true;

      // this is where the logic will get tricky:
      // As the platform implementation of .findAll()
      // we have to decide if we are storing/retrieving data
      // locally, remotely, or a combination of both.
      //
      // Those settings should be in AB.Policy.*
      // (however Policies aren't implemented at the moment so...)

      // if we are supposed to be working with remote data:
      // var serviceType = AB.Policy.[someParam]
      // var params = this.urlParamsFind(cond);
      // return AB.Comm[serviceType].get(params, {contextParam})

      // else
      //	return [];

      // for now:
      const responseContext = this.responseContext;
      responseContext.context.verb =
         responseContext?.context?.verb || "find";
      return this.processRequest(
         "get",
         this.urlParamsFind(cond),
         responseContext,
      );
   }

   /**
    * @method update
    * update model values on the server.
    */
   update(id, values) {
      this.prepareMultilingualData(values);

      // remove empty properties
      for (const key in values) if (values[key] == null) delete values[key];

      // fire off a Relay Request to update this on the server too:
      const params = this.urlParamsUpdate(id, values);
      const responseContext = this.responseContext; // this.object.application.cloneDeep(this.responseContext);
      responseContext.context.verb = "update";
      responseContext.context.jobID = this.AB.uuid();
      this.object.latestUpdates = this.object.latestUpdates || {};
      this.object.latestUpdates[id] = responseContext.context.jobID;
      return this.processRequest("put", params, responseContext);
   }
};
