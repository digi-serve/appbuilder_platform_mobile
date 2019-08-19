/**
 * ABModel
 * 
 * This is the platform dependent implementation of an ABModel.
 *
 */

var ABModelCore = require( "../core/ABModelCore");
var storage = require("../../resources/Storage").storage;


// /**
//  * @method triggerEvent 
//  * Publish a event when data in the model is changed
//  * 
//  * @param {string} action - create, update, delete
//  * @param {ABObject} object
//  * @param {*} data 
//  */
// function triggerEvent(action, object, data) {

// 	// Trigger a event to data collections of application and the live display pages
// 	AD.comm.hub.publish('ab.datacollection.' + action, {
// 		objectId: object.id,
// 		data: data
// 	});
	
// }

// // Start listening for server events for object updates and call triggerEvent as the callback
// io.socket.on("ab.datacollection.create", function (msg) {
//   triggerEvent("create", {id:msg.objectId}, msg.data);
// });

// io.socket.on("ab.datacollection.delete", function (msg) {
//   triggerEvent("delete", {id:msg.objectId}, msg.id);
// });

// io.socket.on("ab.datacollection.stale", function (msg) {
//   triggerEvent("stale", {id:msg.objectId}, msg.data);
// });

// io.socket.on("ab.datacollection.update", function (msg) {
//   triggerEvent("update", {id:msg.objectId}, msg.data);
// });



module.exports =  class ABModelLocal extends ABModelCore {

    constructor(object) {

    	super(object);

  	}


    /**
     * platformInit
     * make sure we are ready for operation on this platform.
     * this implies we need to make sure each ABObject we use can
     * store information in the DB.
     * @return {Promise}
     */
    platformInit () {
        return new Promise((resolve, reject)=>{

        	// var storage = AB.Platform.storage;

        	var lock = this.lock();
        	lock.acquire()
        	.then(()=>{
				return storage.get(this.refStorage());
        	})
        	.then((allObjects)=>{
        		// if data was returned, then we have already been initialized.
        		if (allObjects) {
        			resolve();
        			return;
        		} 

        		// if nothing returned, initialize to an empty data set
        		return storage.set(this.refStorage(), {});
        	})
        	.then(()=>{
        		lock.release();
        		resolve();
        	})
        	.catch((err)=>{
        		lock.release();
        		reject(err);
        	})

        })
    }


    /**
     * platformReset
     * this is called when the App requires a hard reset(). 
     * Our job is to clear out any data we are storing to a new, uninitialized
     * state.
     * @return {Promise}
     */
    platformReset () {
        return new Promise((resolve, reject)=>{

        	// var storage = AB.Platform.storage;

        	var lock = this.lock();
        	lock.acquire()
        	.then(()=>{
				// if nothing returned, initialize to an empty data set
        		return storage.set(this.refStorage(), null);
        	})
        	.then(()=>{
        		lock.release();
        		resolve();
        	})
        	.catch((err)=>{
        		lock.release();
        		reject(err);
        	})

        })
    }

    lock () {
  		return storage.Lock(this.refStorage())
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

		// var storage = AB.Platform.storage;
		return storage.get(this.refStorage())
			.then((allObjects)=>{

				allObjects = allObjects || {};
				return allObjects;
			})
  	}

  	saveLocalData(allObjects) {
		// var storage = AB.Platform.storage;
		return storage.set(this.refStorage(), allObjects);
  	}


  	localStorageCreate(data) {

  		var UUID = this.object.fieldUUID(data);

  		var lock = this.lock();
  		return lock.acquire()
  			.then(()=>{
// console.log('--- '+this.refStorage()+'.localStorageCreate start', allData);
  				return this.getLocalData();
  			})
			.then((allObjects) =>{

				// if current data item is not in allObjects, add it:
				if (!allObjects[data[UUID]]) {
					allObjects[data[UUID]] = data;
				}

				return allObjects;
			})
			.then((allObjects)=>{

				// make sure our copy of the data has all the fields in 
				// the incoming data:

				var ours = allObjects[data[UUID]];
				for (var d in data) {

// Question: do we store __relation  fields?
// if (d.indexOf('__relation') == -1) {

					if (!ours[d]) {
						ours[d] = data[d];
					}
// }
				}

				return allObjects;
			})
			.then((allObjects)=>{
				return this.saveLocalData(allObjects);
			})
            .then((returnValue)=>{
// console.log('--- '+this.refStorage()+'.localStorageCreate end', data);
                lock.release();
                return returnValue;
            })
            .catch((err)=>{
                lock.release();
            });
  	}


  	localStorageDestroy(id) {

  		var UUID = this.object.fieldUUID();
  		var lock = this.lock();
  		return lock.acquire()
  			.then(()=>{
// console.log('--- '+this.refStorage()+'.localStorageDestroy start', allData);
  				return this.getLocalData()
  			})
			.then((allObjects)=>{

				// if this is a UUID:
				if (isNaN(parseInt(id)) || (id.indexOf && id.indexOf('-') > -1)) {
					for(var o in allObjects) {
						var obj = allObjects[o];
						if (obj.uuid == id) {
							delete allObjects[o];
						}
					}
					// allObjects = allObjects.filter((o)=>{ return o.uuid != id;});
				} else {
					var PK = this.object.PK();

					// search the objects and remove one with matching PK
					var newList = {};
					for(var o in allObjects) {
						var obj = allObjects[o];
						if (obj[PK] != id) {
							newList[obj[UUID]] = obj;
						}
					}
					allObjects = newList;
				}

				return this.saveLocalData(allObjects);
			})
            .then((returnValue)=>{
// console.log('--- '+this.refStorage()+'.localStorageDestroy end', data);
                lock.release();
                return returnValue;
            })
            .catch((err)=>{
				console.error('!!! error trying to delete object:', err);
                lock.release();
            });
  	}


  	// make sure we locally store these values
  	localStorageStore(allData) {
// Transition: move to .saveNew()
  		return this.saveNew(allData);
  	}


  	// update an entry IF WE CURRENTLY track it locally
  	localStorageUpdate(data) {

  		var UUID = this.object.fieldUUID(data);

  		// we can't resolve this entry if it doesn't have our UUID
  		if (!data[UUID]) return Promise.resolve();

  		var lock = this.lock();
  		return lock.acquire()
  			.then(()=>{
// console.log('--- '+this.refStorage()+'.localStorageUpdate start', data);
  				return this.getLocalData()
  			}) 
			.then((allObjects) =>{

//// TODO:  be smarter here.  just because we get updated of an updated 
//// value from the server, doesn't mean it's more important than our value.


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
				}

				return allObjects;
			})
			.then((allObjects)=>{
				return this.saveLocalData(allObjects);
			})
            .then((returnValue)=>{
// console.log('--- '+this.refStorage()+'.localStorageUpdate end', data);
                lock.release();
                return returnValue;
            })
            .catch((err)=>{
				console.error('!!! error trying to update object:', err);
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
		if (!values[UUID]) values[UUID] = this.object.application.uuid();


		return this.localStorageCreate(values);
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
	findAll(cond) {

		cond = cond || {};

		var lock = this.lock();
  		return lock.acquire()
  			.then(()=>{
// console.log('--- '+this.refStorage()+'.localStorageUpdate start', data);
  				return this.getLocalData()
  			}) 
			.then((allObjects)=>{
		
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
			.then((returnValues)=>{
                lock.release();
                return returnValues;
            })
            .catch((err)=>{
				console.error('!!! error trying to findAll():', err);
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

		return this.localStorageUpdate(values)
			.then((data)=>{

				this.normalizeData(data);

				return data;
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
  		return lock.acquire()
  			.then(()=>{
// console.log('--- '+this.refStorage()+'.localStorageStore start', allData);
  				return this.getLocalData();
  			})
			.then((allObjects) =>{

				foundEntry = allObjects[data[UUID]];
				return foundEntry?true:false;
			})
            .then((returnValue)=>{
// console.log('--- '+this.refStorage()+'.localStorageStore end', allData);
                lock.release();
                return returnValue;
            })
            .catch((err)=>{
				console.error('!!! error trying to read object:', err);
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
		return new Promise((resolve, reject)=>{

			// we are being given data from the server
			// but our local data could be more relevant

			// v0.1 initial sync logic
			// save new items, update only newer copies 
			this.saveNew(data)
			.then(()=>{

//// TODO: consider a more github like approach that would allow us
//// to merge changes together during this process.

				return this.updateNewer(data);
			})
			.then(()=>{
				// normalize our data before we return it
				this.normalizeData(data);
				return data;
			})
			.then(resolve)
			.catch(reject);

		})
	}

	/**
	 * syncRemoteMaster()
	 * process a set of incoming data (from the server) where
	 * the data we received should have priority over any local
	 * data.
	 * 
	 * @param {array} data 
	 * @return {Promise}
	 *		returns a normalized set of data for this object
	 */
	syncRemoteMaster(data) {
		return new Promise((resolve, reject)=>{

			// this means that we should use whatever the remote gave us:
			// save new items, then replace existing ones
			this.saveNew(data)
			.then(()=>{
				return this.updateExisting(data)
			})
			.then(()=>{
				// normalize our data before we return it
				this.normalizeData(data);
				return data;
			})
			.then(resolve)
			.catch(reject);

		})
	}

	/**
	 * saveNew()
	 * only save new entries from the provided set of data.
	 * @param {array} allData 
	 * @return {Promise}
	 */
	saveNew(allData) {

  		if (!Array.isArray(allData)) allData = [allData];

  		var lock = this.lock();
  		return lock.acquire()
  			.then(()=>{
// console.log('--- '+this.refStorage()+'.localStorageStore start', allData);
  				return this.getLocalData();
  			})
			.then((allObjects) =>{

				allData.forEach((data)=>{

					var UUID = this.object.fieldUUID(data);

					// if data doesn't have our UUID we can't track it:
					if (!data[UUID]) return;

					// if entry doesn't already exist, then add it:
					if (!allObjects[data[UUID]]) {
						allObjects[data[UUID]] = data;
					}

				})

				return allObjects;
			})
			.then((allObjects)=>{
				return this.saveLocalData(allObjects);
			})
            .then((returnValue)=>{
// console.log('--- '+this.refStorage()+'.localStorageStore end', allData);
                lock.release();
                return returnValue;
            })
            .catch((err)=>{
				console.error('!!! error trying to store object:', err);
                lock.release();
            });
	}

	/**
	 * updateExisting()
	 * Overwrite any existing entries with the ones being passed in.
	 * @param {array} allData 
	 * @return {Promise}
	 */
	updateExisting(allData) {

  		if (!Array.isArray(allData)) allData = [allData];

  		var lock = this.lock();
  		return lock.acquire()
  			.then(()=>{
// console.log('--- '+this.refStorage()+'.localStorageStore start', allData);
  				return this.getLocalData();
  			})
			.then((allObjects) =>{

				allData.forEach((data)=>{

					var UUID = this.object.fieldUUID(data);

					// if data doesn't have our UUID we can't track it:
					if (!data[UUID]) return;

					// if entry DOES exist, then overwrite it:
					if (allObjects[data[UUID]]) {
						allObjects[data[UUID]] = data;
					}

				})

				return allObjects;
			})
			.then((allObjects)=>{
				return this.saveLocalData(allObjects);
			})
            .then((returnValue)=>{
// console.log('--- '+this.refStorage()+'.localStorageStore end', allData);
                lock.release();
                return returnValue;
            })
            .catch((err)=>{
				console.error('!!! error trying to store object:', err);
                lock.release();
            });
	}

	/**
	 * updateNewer()
	 * Overwrite any existing entries with the ones being passed in IF they
	 * are newer than what we have.
	 * @param {array} allData 
	 * @return {Promise}
	 */
	updateNewer(allData) {

  		if (!Array.isArray(allData)) allData = [allData];

  		var lock = this.lock();
  		return lock.acquire()
  			.then(()=>{
// console.log('--- '+this.refStorage()+'.localStorageStore start', allData);
  				return this.getLocalData();
  			})
			.then((allObjects) =>{

				allData.forEach((data)=>{

					var UUID = this.object.fieldUUID(data);

					// if data doesn't have our UUID we can't track it:
					if (!data[UUID]) return;

					// if data doesn't have an updated_at field, we can't sync it
					if (typeof data.updated_at == "undefined") return;

					// if entry DOES exist, then 
					if (allObjects[data[UUID]]) {

						// if the new data is later than our current Data
						var dataDate = new Date(data.updated_at);
						var currDate = new Date(allObjects[data[UUID]].updated_at);
						if (dataDate > currDate) {
							allObjects[data[UUID]] = data;
						}
						
					}

				})

				return allObjects;
			})
			.then((allObjects)=>{
				return this.saveLocalData(allObjects);
			})
            .then((returnValue)=>{
// console.log('--- '+this.refStorage()+'.localStorageStore end', allData);
                lock.release();
                return returnValue;
            })
            .catch((err)=>{
				console.error('!!! error trying to store object:', err);
                lock.release();
            });
	}


	refStorage () {
		var prefix = "O:";
		if (this.object.importJoins) {
			prefix = "Q:";
		}
		return `${prefix}${this.object.name}`;
	}


}
