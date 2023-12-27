/**
 * ABModel
 *
 * This is the platform dependent implementation of an ABModel.
 *
 */

var ABModelCore = require("../core/ABModelCore");
var storage = require("../../resources/Storage").storage;

var merge = require("lodash/merge");

module.exports = class ABModelLocal extends ABModelCore {
   /**
    * platformInit
    * make sure we are ready for operation on this platform.
    * this implies we need to make sure each ABObject we use can
    * store information in the DB.
    *
    * if data is already present, return allObjects
    *
    * @return {Promise}
    */
   platformInit() {
      return new Promise((resolve, reject) => {
         var lock = this.lock();
         lock
            .acquire()
            .then(() => {
               return storage.get(this.refStorage());
            })
            .then((allObjects) => {
               // if data was returned, then we have already been initialized.
               if (allObjects) {
                  lock.release();
                  resolve(allObjects);
                  return;
               }

               // if nothing returned, initialize to an empty data set
               return storage.set(this.refStorage(), {}).then(() => {
                  lock.release();
                  resolve({});
               });
            })
            .catch((err) => {
               lock.release();
               reject(err);
            });
      });
   }

   /**
    * platformReset
    * this is called when the App requires a hard reset().
    * Our job is to clear out any data we are storing to a new, uninitialized
    * state.
    * @return {Promise}
    */
   platformReset() {
      return new Promise((resolve, reject) => {
         var lock = this.lock();
         lock
            .acquire()
            .then(() => {
               // if nothing returned, initialize to an empty data set
               return storage.set(this.refStorage(), null);
            })
            .then(() => {
               lock.release();
               resolve();
            })
            .catch((err) => {
               lock.release();
               reject(err);
            });
      });
   }

   lock() {
      return storage.Lock(this.refStorage());
   }

   /**
    * getLocalData()
    * return all the local entries for this model's object.
    * NOTE: this method is reused in more complex operations
    * so it does not Lock the data before accessing. It is
    * expected the external operations will .lock() the data
    * @return {Promise}
    *		resolved: with a hash of the stored data:
    *			{ uuid: {obj1}, uuid2:{obj2} }
    */
   getLocalData() {
      return storage.get(this.refStorage()).then((allObjects) => {
         allObjects = allObjects || {};
         return allObjects;
      });
   }

   /**
    * saveLocalData()
    *
    * @param {hash} allObjects
    * @return {Promise}
    */
   saveLocalData(allObjects) {
      return storage.set(this.refStorage(), allObjects);
   }
   /**
    * clearLocalData()
    * remove the local encrypted data for this object.
    * @return {Promise}
    */
   clearLocalData() {
      return storage.clear(this.refStorage());
   }

   localStorageDestroy(id) {
      var UUID = this.object.fieldUUID();
      var lock = this.lock();
      return lock
         .acquire()
         .then(() => {
            // console.log('--- '+this.refStorage()+'.localStorageDestroy start', allData);
            return this.getLocalData();
         })
         .then(() => {
            // ! Make sure we don't have zombie records
            // ? Is there a more efficient way to do this?
            return this.clearLocalData();
         })
         .then((allObjects) => {
            // TODO use this.object.fieldUUID() to get the field name of the UUID
            // if this is a UUID:
            if (this.isUUID(id)) {
               // if we can quickly locate the entry, remove it:
               if (allObjects[id]) {
                  console.log(
                     "ABModelLocal.js: localStorageDestroy(): quickly removing entry::",
                     id,
                     allObjects[id]
                  );
                  delete allObjects[id];
               } else {
                  // else we need to search for it:
                  for (let o in allObjects) {
                     let obj = allObjects[o];
                     if (obj.uuid == id) {
                        delete allObjects[o];
                     }
                  }
               }
            } else {
               var PK = this.object.PK();

               // search the objects and remove one with matching PK
               var newList = {};
               for (let o in allObjects) {
                  let obj = allObjects[o];
                  if (obj[PK] != id) {
                     newList[obj[UUID]] = obj;
                  }
               }
               allObjects = newList;
            }

            return this.saveLocalData(allObjects);
         })
         .then((returnValue) => {
            // console.log('--- '+this.refStorage()+'.localStorageDestroy end', data);
            lock.release();
            return returnValue;
         })
         .catch((err) => {
            console.error("!!! error trying to delete object:", err);
            lock.release();
         });
   }

   isUUID(str) {
      const uuidPattern =
         /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidPattern.test(str);
   }

   // make sure we locally store these values
   localStorageStore(allData) {
      console.error(
         "who is calling ABModelLocal.localStorageStore()?",
         allData
      );
      // only keep if newer
      return this.updateNewer(allData);
   }

   // update an entry IF WE CURRENTLY track it locally
   localStorageUpdate(data) {
      var UUID = this.object.fieldUUID(data);

      // we can't resolve this entry if it doesn't have our UUID
      if (!data[UUID]) return Promise.resolve();

      var lock = this.lock();
      return lock
         .acquire()
         .then(() => {
            return this.getLocalData();
         })
         .then((allObjects) => {
            //// TODO:  be smarter here.  just because we get updated of an updated
            //// value from the server, doesn't mean it's more important than our value.
            // this should only accessed when editing entries locally: from a form

            // if current data item is currently one we track
            var foundEntry = null;
            for (var o in allObjects) {
               if (allObjects[o].uuid == data[UUID]) {
                  foundEntry = allObjects[o];
               }
            }
            if (foundEntry) {
               // update currentValue with the values provided in data
               for (var d in data) {
                  foundEntry[d] = data[d];
               }
            } else {
               // else add it as new record:
               allObjects[data[UUID]] = data;
            }

            return allObjects;
         })
         .then((allObjects) => {
            return this.saveLocalData(allObjects);
         })
         .then((returnValue) => {
            lock.release();
            return returnValue || data;
         })
         .catch((err) => {
            console.error("!!! error trying to update object:", err);
            lock.release();
         });
   }

   /**
    * @method create
    * update model values on the server.
    */
   create(values) {
      this.prepareMultilingualData(values);

      // make sure any values we create have a UUID field set:
      var UUID = this.object.fieldUUID(values);
      if (!values[UUID]) values[UUID] = this.AB.uuid();

      // ensure values date_updated is set
      values["updated_at"] = new Date();
      // since this is new data:
      values["created_at"] = new Date();

      // this performs the same as saveNew, but for a single record: so send to saveNew()
      // return this.localStorageCreate(values);
      return this.saveNew(values);
   }

   /**
    * @method delete
    * remove this model instance from the server
    * @param {integer} id  the .id of the instance to remove.
    * @return {Promise}
    */
   delete(id) {
      return this.localStorageDestroy(id);
   }

   /**
    * @method findAll
    * performs a data find with the provided condition.
    */
   findAll(/* cond */) {
      // cond = cond || {};

      var lock = this.lock();
      return lock
         .acquire()
         .then(() => {
            return this.getLocalData();
         })
         .then((allObjects) => {
            // expecting allObjects to be a hash of values:
            // {
            //		'uuid' : {obj},
            //		'abcd-abcd-...' : { id:1, uuid:'abcd-abcd-...' ... }
            // }

            var values = [];
            for (var o in allObjects) {
               //// TODO: make sure allObjects[o]  passes the given condition before adding here:
               values.push(allObjects[o]);
            }
            this.normalizeData(values);
            return values;
         })
         .then((returnValues) => {
            lock.release();
            return returnValues;
         })
         .catch((err) => {
            console.error("!!! error trying to findAll():", err);
            lock.release();
         });
   }

   /**
    * @method update
    * update model values on the server.
    */
   update(id, values) {
      this.prepareMultilingualData(values);

      // remove empty properties
      // for (var key in values) {
      // 	if (values[key] == null)
      // 		delete values[key];
      // }
      // ensure values contains our uuid/id
      if (!values.uuid) {
         values.uuid = id;
      }
      // ensure values date_updated is set
      values["updated_at"] = new Date();

      return this.localStorageUpdate(values).then((/* data */) => {
         this.normalizeData(values);
      });
   }

   /**
    * doesExist()
    * checks to see if the current object already exists in this
    * Object's data store.
    * @param {obj} data
    * @return {Promise}
    */
   doesExist(data) {
      var UUID = this.object.fieldUUID(data);

      var foundEntry = null;

      var lock = this.lock();
      return lock
         .acquire()
         .then(() => {
            return this.getLocalData();
         })
         .then((allObjects) => {
            foundEntry = allObjects[data[UUID]];
            return foundEntry ? true : false;
         })
         .then((returnValue) => {
            lock.release();
            return returnValue;
         })
         .catch((err) => {
            console.error("!!! error trying to read object:", err);
            lock.release();
         });
   }

   /**
    * syncLocalMaster()
    * process a set of incoming data (from the server) where
    * the data we are working with locally should have priority
    * if there are any discrepencies.
    *
    * Note: the data returned from this will represent the
    * data that the Application SHOULD be using: so if a local
    * entry overrides what the server sent, the local version
    * is returned.
    *
    * @param {array} data
    * @return {Promise}
    *		returns a normalized set of data for this object
    */
   syncLocalMaster(data) {
      data = this.dataVerify(data);
      data = this.unlock(data);
      return new Promise((resolve, reject) => {
         // we are being given data from the server
         // but our local data could be more relevant

         // v0.2 initial sync logic
         // save new items, update only newer copies
         this.updateNewer(data)
            .then(() => {
               // normalize our data before we return it
               this.normalizeData(data);
               return data;
            })
            .then(resolve)
            .catch(reject);
      });
   }

   /**
    * syncRemoteMaster()
    * process a set of incoming data (from the server) where
    * the data we received should have priority over any local
    * data.
    * This is called when the server responds to a local create
    *
    * @param {array} data
    * @return {Promise}
    *		returns a normalized set of data for this object
    */
   syncRemoteMaster(data) {
      data = this.dataVerify(data);
      data = this.unlock(data);
      return new Promise((resolve, reject) => {
         // this means that we should use whatever the remote gave us:
         // save new items and replace existing ones
         this.updateExisting(data)
            .then(() => {
               // normalize our data before we return it
               this.normalizeData(data);
               return data;
            })
            .then(resolve)
            .catch(reject);
      });
   }

   /**
    * saveNew()
    * save ONLY new entries from the provided set of data.
    * efficiently ONLY add new entries to our local data store.
    * @param {array} allData
    * @return {Promise}
    */
   saveNew(allData) {
      allData = this.dataVerify(allData);

      var lock = this.lock();
      return lock
         .acquire()
         .then(() => {
            return this.getLocalData();
         })
         .then((allObjects) => {
            allData.forEach((data) => {
               var UUID = this.object.fieldUUID(data);

               // if data doesn't have our UUID we can't track it:
               if (!data[UUID]) return;

               // if entry doesn't already exist, then add it:
               if (!allObjects[data[UUID]]) {
                  allObjects[data[UUID]] = data;
               }
            });

            return allObjects;
         })
         .then((allObjects) => {
            return this.saveLocalData(allObjects);
         })
         .then((returnValue) => {
            lock.release();
            return returnValue;
         })
         .catch((err) => {
            console.error("!!! error trying to store object:", err);
            lock.release();
         });
   }

   /**
    * updateExisting()
    * Overwrite any existing entries with the ones being passed in.
    * Also adding any non-preexisting entries.
    * @param {array} allData
    * @return {Promise}
    */
   updateExisting(allData) {
      var lock = this.lock();
      return lock
         .acquire()
         .then(() => {
            return this.getLocalData();
         })
         .then((allObjects) => {
            // we need to compare these entries to our current data

            allData.forEach((data) => {
               var UUID = this.object.fieldUUID(data);

               // if data doesn't have our UUID we can't track it:
               if (!data[UUID]) return;

               // Create entry, overwriting if one happens to exist
               allObjects[data[UUID]] = data;
            });

            return allObjects;
         })
         .then((allObjects) => {
            return this.saveLocalData(allObjects);
         })
         .then((returnValue) => {
            lock.release();
            return returnValue;
         })
         .catch((err) => {
            console.error("!!! error trying to store object:", err);
            lock.release();
         });
   }

   /**
    * updateNewer()
    * Overwrite any existing entries with the ones being passed in IF they
    * are newer than what we have.
    * default to keeping local data
    * also add any non-preexisting entries.
    * @param {array} allData
    * @return {Promise}
    */
   updateNewer(allData) {
      allData = this.dataVerify(allData);

      var lock = this.lock();
      return lock
         .acquire()
         .then(() => {
            return this.getLocalData();
         })
         .then((allObjects) => {
            const UUID = this.object.fieldUUID(allData[0]);
            allData.forEach((data) => {
               // if data doesn't have our UUID we can't track it:
               if (!data[UUID]) return;

               // if data doesn't have an updated_at field, we can't sync it
               if (typeof data.updated_at == "undefined") {
                  console.error(
                     "!!! error trying to store object: data.updated_at is undefined",
                     data,
                     this
                  );
                  // assume we keep the local copy
                  return;
               }

               // if entry DOES exist
               if (allObjects[data[UUID]]) {
                  var newDate = new Date(data.updated_at);

                  let oldDate = allObjects[data[UUID]].updated_at;
                  if (!oldDate) {
                     console.error(
                        "ABModelLocal.js: updateNewer(): missing updated_at:: ",
                        allObjects[data[UUID]]
                     );
                     return;
                  }
                  // compare dates
                  if (newDate > oldDate) {
                     allObjects[data[UUID]] = data;
                  } else {
                     // there may be new information: fold it into the existing record
                     // use lodash merge
                     allObjects[data[UUID]] = merge(
                        allObjects[data[UUID]],
                        data
                     );
                  }
               } else {
                  // else add it as new record:
                  allObjects[data[UUID]] = data;
               }
            });

            return allObjects;
         })
         .then((allObjects) => {
            return this.saveLocalData(allObjects);
         })
         .then((returnValue) => {
            lock.release();
            return returnValue;
         })
         .catch((err) => {
            console.error("!!! error trying to store object:", err);
            lock.release();
         });
   }

   dataVerify(allData) {
      // TODO this should be unnecessary
      if (allData.data?.length) {
         console.error("data.data should not be issue here. @achoobert");
         allData = allData.data;
      }
      if (!Array.isArray(allData)) {
         console.error("Array data should not be issue here. @achoobert");
         allData = [allData];
      }
      return allData;
   }

   /**
    * We are being given data from the server
    * therefore our local data does not have to be locked anymore
    * Note that the lock is set in ABModel.js
    * @param {array} allData
    */
   unlock(allData) {
      // TODO is it possible to limit this to only the data we need?
      // synctype of some sort?
      if (Array.isArray(allData)) {
         // set 'lock' to false
         allData.forEach((data) => {
            data["lock"] = false;
         });
      } else {
         console.error("Array data should not be issue here.");
      }
      return allData;
   }

   refStorage() {
      var prefix = "O:";
      if (this.object.importJoins) {
         prefix = "Q:";
      }
      return `${prefix}${this.object.name}`;
   }
};
