/**
 * ABObject
 *
 * This is the platform dependent implementation of ABObject.
 *
 */

const ABObjectCore = require("../core/ABObjectCore");

module.exports = class ABObject extends ABObjectCore {
   constructor(...args) {
      super(...args);
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

   ///
   /// URL Methods
   /// are we overwriting???
   ///

   /**
    * @method urlRest
    * return the url to access the data for this object.
    * @return {string}
    */
   urlRest() {
      return `/app_builder/model/${this.id}`;
   }

   /**
    * @method urlRestBatch
    * return the url to use for batch creates for this object
    * @return {string}
    */
   urlRestBatch() {
      return `/app_builder/batch/model/${this.id}`;
   }

   /**
    * @method urlRestItem
    * return the url to access the data for an instance of this object.
    * @return {string}
    */
   urlRestItem(id) {
      return `/app_builder/model/${this.id}/${id}`;
   }

   /**
    * @method urlRestLog
    * return the url to access the logs for this ABObject.
    * @return {string}
    */
   urlRestLog() {
      return `/app_builder/object/${this.id}/track`;
   }

   /**
    * @method urlRestRefresh
    * return the url to signal a refresh for this object.
    * @return {string}
    */
   urlRestRefresh() {
      console.dir("urlRestRefresh() is deprecated, who is calling this?");
      return `/app_builder/model/refreshobject/${this.id}`;
   }

   /**
    * @method urlCount
    * return the url to count of data for this object.
    * @return {string}
    */
   urlRestCount() {
      return `/app_builder/model/${this.id}/count`;
   }

   /**
    * @method remoteData
    * return the url parameters to use for a .create() request
    * @param context {json} 
    * @return data {json} the values to create
    */
   remoteData(context, data) {
      if (context.error) {
         // Question: so how do we handle error responses?
         console.error(
            `ABObject[${this.name}]:remoteData(): an error was received when processing a job. verb[${context.verb}]`
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
            return this.model().local().localStorageCreate(data);
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
         return this.model().local().localStorageDestroy(id);
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
         return this.model().local().localStorageUpdate(data);
      });
   }
};
