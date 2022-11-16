/**
 * ABObject
 *
 * This is the platform dependent implementation of ABObject.
 *
 */

var ABObjectCore = require("../core/ABObjectCore");
var Network = require("../../resources/Network").default;

module.exports = class ABObject extends ABObjectCore {
   constructor(attributes, application) {
      super(attributes, application);

      // Setup a listener for this Object to catch updates from the relay
      Network.on(ABObjectCore.contextKey(), (context, data) => {
         // is this update for me?
         if (context.id == this.id) {
            console.log();
            console.log("-----------");
            console.log(":: ABObject.Relay.on:" + ABObjectCore.contextKey());
            console.log(":: context:", context);
            if (this.name) {
               console.log(":: name:", this.name);
            }
            if (data.error || data.name === "StatusCodeError") {
               console.error({ "Error getting data: ": data.name });
            }
            console.log(":: data:", data);

            context.verb = context.verb || "unknown";
            switch (context.verb) {
               case "create":
                  // we are being alerted of a NEW object instance.
                  // this might come as a result of our own local().create()
                  // or the server might initiate a push of new data.

                  // if data does not already exist locally create it
                  this.model()
                     .local()
                     .syncLocalMaster(data)
                     .then(() => {
                        // alert any DataCollections that are using this
                        // object that there might be new data for them to
                        // use.
                        this.emit("CREATE", data);
                     });
                  break;

               case "update":
                  // we are being alerted of UPDATED data from the server.

                  // response can be in format:
                  // {
                  //     status:"success",
                  //     data:{ data obj }
                  // }
                  // if this is a response to one of our .updates()
                  if (context.jobID) {
                     // Where is `latestUpdates` set? 
                     // @see ABModelRelay.js maybe?
                     if (!this.latestUpdates) {
                        return;
                     }
                     // if this is the last update we sent for this object
                     else if (context.jobID !== this.latestUpdates[data.uuid]) {
                        return;
                     } else {
                        delete this.latestUpdates[data.uuid];
                     }
                  }

                  if (data.status && data.status == "success") {
                     data = data.data;
                  }
                  if (!data) return;

                  // if data does not already exist locally ignore it
                  this.model()
                     .local()
                     .doesExist(data)
                     .then((exists) => {
                        if (exists) {
                           this.model()
                              .local()
                              .syncLocalMaster(data)
                              .then(() => {
                                 // alert any DataCollections that are using this
                                 // object that there might be new data for them to
                                 // use.
                                 this.emit("UPDATE", data);
                              });
                        }
                     });
                  break;

               case "delete":
                  // we are being alerted of DELETED data from the server.

                  // if we initiated this process, and this is a response,
                  // then data should look like:
                  // {
                  //     numRows: #
                  // }

                  if (data.numRows && data.numRows > 0) {
                     // this was a successful delete,
                     // alert our Datacollections:
                     this.emit("DELETE", context.pk);
                  }

                  /*
                        // if data already exists locally, we delete it
                        this.model().local().doesExist(data)
                        .then((exists)=>{
                            if (exists) {


                                // if the context provides the .pk value,
                                // use that to perform the local delete:
                                var id = data[context.pk];
                                if (!id) {

                                    // otherwise attempt to gather it from the
                                    // data itself:
                                    var UUID = this.fieldUUID(data);
                                    id = data[UUID];
                                }
                                
                                if (id) {
                                    this.model().local().localStorageDestroy(id)
                                    .then(()=>{
                                        // alert any DataCollections that are using this 
                                        // object that they should remove this entry:
                                        this.emit("DELETE", data);
                                    })
                                } else {
                                    console.error("ABObject.Relay.on: Delete: could not determine .id", { context:context, UUID:UUID, data:data })
                                }
                            }
                        })
                        */
                  break;

               default:
                  // console.error(
                  //     "ABObject.Relay.on:  unknown context.verb",
                  //     context,
                  //     data
                  // );

                  // TODO: Legacy: remove this once Events and Profile are upgraded.
                  this.emit("data", data);
                  break;
            }
         }
      });
   }

   currentView() {
      // The Mobile Platform does not support the Object Views of the
      // AppBuilder designer's Object Workspace.
      return null;
   }

   /**
    * fieldUUID()
    * returns the id of the data to use as a unique identifier
    * on the local device.  Used for relating remote data (with .id)
    * to local data (that should have uuid).
    * @param {json} data An optional set of data used in conjunction
    *               with this request.
    * @return {string} the uuid field name
    */
   fieldUUID(data) {
      // an ABObject defines a primary key field: PK()
      // lets start with that.
      var field = this.PK();

      // however, we prefer to use uuid's on the local device,
      // so if the data has a 'uuid' field, use that:
      if (data && data.uuid) {
         field = "uuid";
      }

      // some special objects from HRIS have their own guid
      // fields that we should use if we are that object.
      // TODO:  update our external tables to report a uuid() field
      switch (this.name) {
         case "hris_ren_data":
            field = "ren_guid";
            break;
         case "hris_rentype_data":
            field = "rentype_id";
            break;
         case "hris_email":
            field = "email_guid";
            break;
         case "hris_country_data":
            field = "country_id";
            break;
      }

      return field;
   }

   remoteData(context, data) {
      if (context.error) {
         // Question: so how do we handle error responses?
         console.error(
            "ABObject[" +
               this.name +
               "]:remoteData(): an error was received when processing a job. verb[" +
               context.verb +
               "]",
            context,
            data
         );
         this.emit("error.remote", { context: context, data: data });

         //// TODO: respond to data.error == "E_VALIDATION",
         ////        data.invalidAttributes = { fieldName : [ errors ] }
         ////        [errors] = { message:'error message', name:'fieldName', params:{type:'string'}}
      } else {
         // now figure out which update fn to call:
         switch (context.verb) {
            case "find":
               this.remoteFind(data);
               break;

            case "create":
               this.remoteCreate(data);
               break;

            case "delete":
               var id = data;

               // if a .pk is sent as part of the context (from our own ModelRelay.delete())
               // use it for our id.
               if (context.pk) id = context.pk;

               this.remoteDelete(id);
               break;

            case "update":
               this.remoteUpdate(data);
               break;
         }
      }
   }

   /**
    * remoteFind
    * called when data from an external source is reported back to
    * this object.
    * @return {Promise}
    */
   remoteFind(data, shouldEmit = true) {
      var model = this.model().local();
      return model.localStorageStore(data).then(() => {
         model.normalizeData(data);
         if (shouldEmit) {
            this.emit("data", data);
         }
         return data;
      });
   }

   /**
    * @method remoteCreate
    * called when we are alerted that a remote system has
    * notified us of a newly created value that we should be
    * aware of.
    *
    * it might have come from us posting a .create() to it,
    * and it is now responding with the updated values:
    *
    * or maybe another part of the system has created it,
    * and the system thinks we should be aware of this new entry.
    *
    */
   remoteCreate(data) {
      var UUID = this.fieldUUID(data);

      // if the data doesn't have our expected uuid field in it,
      // then I can't resolve it to our local data.
      if (!data[UUID]) return Promise.resolve();

      return Promise.resolve()
         .then(() => {
            return this.model()
               .local()
               .localStorageCreate(data);
         })
         .then(() => {
            this.emit("created", data);
         });

      //// TODO: emit('changed')  and have DataCollections
      ////  respond by checking their values and see if
      ////  they need to update as well.
   }

   /**
    * @method remoteDelete
    * called when we are alerted that a remote system has
    * notified us of a deleted value that we should be
    * aware of.
    *
    * it might have come from us posting a .delete() to it,
    * and it is now responding back.
    *
    * or maybe another part of the system has removed it,
    * and the system thinks we should be aware of this change.
    *
    */
   remoteDelete(data) {
      // var UUID = this.fieldUUID();

      // if the data doesn't have our expected uuid field in it,
      // then I can't resolve it to our local data.
      // if (!data[UUID]) return Promise.resolve();

      return Promise.resolve().then(() => {
         var PK = this.PK();
         var id = data;
         if (data[PK]) id = data[PK];
         return this.model()
            .local()
            .localStorageDestroy(id);
      });
   }

   /**
    * @method remoteUpdate
    * called when we are alerted that a remote system has
    * updated a value that we should be aware of.
    *
    * it might have come from us posting an .update() to it,
    * and it is now responding back.
    *
    * or maybe another part of the system has updated it,
    * and the system thinks we should be aware of this change.
    *
    */
   remoteUpdate(data) {
      // make sure our given data is a data packet and not
      // just a { status:'success' } message.
      if (data.status) {
         data = data.data;
      }
      if (!data) return Promise.resolve();

      var UUID = this.fieldUUID(data);

      // if the data doesn't have our expected uuid field in it,
      // then I can't resolve it to our local data.
      if (!data[UUID]) return Promise.resolve();

      return Promise.resolve().then(() => {
         return this.model()
            .local()
            .localStorageUpdate(data);
      });
   }
};
