/**
 * ABModel
 *
 * This is the platform dependent implementation of an ABModel.
 *
 */

var ABModelCore = require("../core/ABModelCore");
var ABModelLocal = require("./ABModelLocal");
var ABModelRelay = require("./ABModelRelay");
module.exports = class ABModel extends ABModelCore {
   local() {
      var newModel = new ABModelLocal(this.object);
      newModel.contextKey(this.responseContext.key);
      newModel.contextValues(this.responseContext.context);
      return newModel;
   }

   relay() {
      var newModel = new ABModelRelay(this.object);
      newModel.contextKey(this.responseContext.key);
      newModel.contextValues(this.responseContext.context);
      return newModel;
   }

   remote() {
      // TODO: look at project settings and determine which
      // type of remote link we will use:
      return this.relay();
   }

   /**
    * @method create
    * update model values on the server.
    * @param {obj} values  the values to create.
    * 
    */
   create(values) {
      this.prepareMultilingualData(values);

      // make sure any values we create have a UUID field set:
      var UUID = this.object.fieldUUID(values);
      if (!values[UUID]) values[UUID] = this.AB.uuid();

      return (
         Promise.resolve()
            .then(() => {
               // get localModel
               // localModel.create(values)
               // let localRecord = values;
               return this.local().create(values);
            })
            .then(() => {
               this.object.emit("CREATE", values);
            })
            //// QUESTION: do we make this process wait upon the
            //// .remote().create() to finish before this can be resolved?
            //// or resolve after .emit() ?

            .then(() => {
               // get remoteModel
               // .create()
               return this.remote().create(values);
            })

            .then(() => {
               // get a list of each connected object
               var connFields = this.object.connectFields();
               // for each object
               connFields.forEach((field) => {
                  // get the current value associated with that object and stop if there is none
                  var currentValues = values[field.columnName];
                  if (currentValues) {
                     // get that ABObject
                     var connectedObj = field.datasourceLink;
                     // search loaded datacollections to see if they contain the connectedObj
                     connectedObj.AB.datacollections().forEach((dc) => {
                        // if datacollection has a datasource and its id matches the connectedObj
                        if (
                           dc.datasource &&
                           dc.datasource.id == connectedObj.id
                        ) {
                           // tell it to load data
                           dc.loadData();
                        }
                     });
                  }
               });
            })
      );
   }

   /**
    * @method delete
    * remove this model instance from from our local and remote storage
    * @param {string} uuid  the .uuid of the instance to remove.
    * @return {Promise}
    */
   delete(id) {
      return Promise.resolve()
         .then(() => {
            // delete from our local storage
            return this.local().delete(id);
         })
         .then(() => {
            this.object.emit("DELETE", id);
         })
         .then(() => {
            // Delete from our Remote source
            return this.remote().delete(id);
         });
   }

   /**
    * @method findAll
    * performs a data find with the provided condition.
    */
   findAll(cond) {
      console.error("why are we getting here?");

      cond = cond || {};

      // this is where the logic will get tricky:
      // As the platform implementation of .findAll()
      // we have to decide if we are storing/retrieving data
      // locally, remotely, or a combination of both.
      //
      // Those settings should be in AB.Policy.*
      // (however Policies aren't implemented at the moment so...)

      return Promise.resolve()
         .then(() => {
            // if we are supposed to be working with remote data:
            // var serviceType = AB.Policy.[someParam]
            // var params = this.urlParamsFind(cond);
            // return AB.Comm[serviceType].get(params, {contextParam})

            // else
            //	return [];

            // for now:
            var params = this.urlParamsFind(cond);
            var responseContext = this.responseContext; // this.object.application.cloneDeep(this.responseContext);
            responseContext.context.verb = "find";
            return AB.Comm.Relay.get(params, responseContext).then(() => {
               // a relay doesn't return the data right away so:
               return [];
            });
         })
         .then((/* remoteData */) => {
            // if we are supposed to work with local data:
            // 	then make the local request and return the data
            // else
            //	return []

            // a DataCollection expects something from this initial
            // chain.
            return this.local().findAll(cond);
            // 				.then((allObjects)=>{

            // 					// expecting allObjects to be a hash of values:
            // 					// {
            // 					//		'uuid' : {obj},
            // 					//		'abcd-abcd-...' : { id:1, uuid:'abcd-abcd-...' ... }
            // 					// }

            // 					var values = [];
            // 					for (var o in allObjects) {

            // //// TODO: make sure allObjects[o]  passes the given condition before adding here:
            // 						values.push(allObjects[o]);
            // 					}
            // 					this.normalizeData(values);
            // 					return values;
            // 				})
         });
   }

   /**
    * @method update
    * update model values on the server.
    */
   update(id, values) {
      this.prepareMultilingualData(values);

      // values.updated_at = this.object.application.updatedAt();

      // remove empty properties
      for (var key in values) {
         if (values[key] == null) delete values[key];
      }

      return (
         Promise.resolve()

            .then(() => {
               this.AB.datacollections().forEach((dc) => {
                  // if datacollection has a datasource and its id matches the connectedObj
                  if (dc.datasource?.id == this.object.id) {
                     // tell it to load data
                     if (dc.__dataCollection.exists(id)) {
                        var entry = dc.__dataCollection.getItem(id);
                        for (var v in values) {
                           entry[v] = values[v];
                        }
                        dc.__dataCollection.updateItem(id, entry);
                        console.log(`DC[${dc.name}] -> entry`, entry);
                     }
                     dc.loadDataDelayed();
                  }
                  // if the datacollection has a field of the objecte we updated we need to update interval
                  if (dc.model?.object) {
                     dc.model.object.fields().forEach((f) => {
                        if (
                           f.datasourceLink &&
                           f.datasourceLink.id == this.object.id
                        ) {
                           dc.loadDataDelayed();
                        }
                     });
                  }
               });
            })
            .then(() => {
               // get localModel
               // localModel.create(values)
               return this.local().update(id, values);
            })
            .then(() => {
               this.object.emit("UPDATE", values);
            })
            //// QUESTION: do we make this process wait upon the
            //// .remote().create() to finish before this can be resolved?
            //// or resolve after .emit() ?

            .then(() => {
               // get remoteModel
               // .create()
               var vals = {};
               Object.keys(values).forEach((key) => {
                  if (key.indexOf("__relation") == -1) {
                     vals[key] = values[key];
                  }
               });
               return this.remote().update(id, vals);
            })
      );
   }
};
