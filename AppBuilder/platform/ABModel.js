/**
 * ABModel
 * 
 * This is the platform dependent implementation of an ABModel.
 *
 */

var ABModelCore = require( "../core/ABModelCore");
var ABModelLocal = require( "./ABModelLocal");
var ABModelRelay = require( "./ABModelRelay");



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



module.exports =  class ABModel extends ABModelCore {

    constructor(object) {

    	super(object);

  	}


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


//   	getLocalData() {

// 		var storage = AB.Platform.storage;
// 		return storage.get(this.object.name)
// 			.then((allObjects)=>{

// 				allObjects = allObjects || {};
// 				return allObjects;
// 			})
//   	}

//   	saveLocalData(allObjects) {
// 		var storage = AB.Platform.storage;
// 		return storage.set(this.object.name, allObjects);
//   	}


//   	localStorageCreate(data) {

//   		var UUID = this.object.fieldUUID();
//   		return this.getLocalData()
// 			.then((allObjects) =>{

// 				// if current data item is not in allObjects, add it:
// 				if (!allObjects[data[UUID]]) {
// 					allObjects[data[UUID]] = data;
// 				}

// 				return allObjects;
// 			})
// 			.then((allObjects)=>{

// 				// make sure our copy of the data has all the fields in 
// 				// the incoming data:

// 				var ours = allObjects[data[UUID]];
// 				for (var d in data) {
// 					if (!ours[d]) {
// 						ours[d] = data[d];
// 					}
// 				}

// 				return allObjects;
// 			})
// 			.then((allObjects)=>{
// 				return this.saveLocalData(allObjects);
// 			})
//   	}


//   	localStorageDestroy(id) {

//   		var UUID = this.object.fieldUUID();
//   		return this.getLocalData()
// 			.then((allObjects)=>{

// 				// if this is a UUID:
// 				if (parseInt(id) == NaN) {
// 					delete allObjects[id]
// 				} else {
// 					var PK = this.object.PK();

// 					// search the objects and remove one with matching PK
// 					var newList = {};
// 					for(var o in allObjects) {
// 						var obj = allObjects[o];
// 						if (obj[PK] != id) {
// 							newList[obj[UUID]] = obj;
// 						}
// 					}
// 					allObjects = newList;
// 				}

// 				return this.saveLocalData(allObjects);
// 			})
//   	}


//   	// make sure we locally store these values
//   	localStorageStore(allData) {

//   		var UUID = this.object.fieldUUID();

//   		if (!Array.isArray(allData)) allData = [allData];

//   		return this.getLocalData()
// 			.then((allObjects) =>{

// 				allData.forEach((data)=>{

// 					// if data doesn't have our UUID we can't track it:
// 					if (!data[UUID]) return;

// 					// if entry doesn't already exist, then add it:
// 					if (!allObjects[data[UUID]]) {
// 						allObjects[data[UUID]] = data;
// 					}

// 				})

// 				return allObjects;
// 			})
// 			.then((allObjects)=>{
// 				return this.saveLocalData(allObjects);
// 			})
//   	}


//   	// update an entry IF WE CURRENTLY track it locally
//   	localStorageUpdate(data) {

//   		var UUID = this.object.fieldUUID();

//   		// we can't resolve this entry if it doesn't have our UUID
//   		if (!data[UUID]) return;

//   		return this.getLocalData()
// 			.then((allObjects) =>{

// //// TODO:  be smarter here.  just because we get updated of an updated 
// //// value from the server, doesn't mean it's more important than our value.


// 				// if current data item is currently one we track
// 				if (allObjects[data[UUID]]) {

// 					// update currentValue with the values provided in data
// 					var currentValue = allObjects[data[UUID]];
// 					for (var d in data) {
// 						currentValue[d] = data[d];
// 					}
// 				}

// 				return allObjects;
// 			})
// 			.then((allObjects)=>{
// 				return this.saveLocalData(allObjects);
// 			})
//   	}


	/**
	 * @method create
	 * update model values on the server.
	 */
	create(values) {

		this.prepareMultilingualData(values);

		// make sure any values we create have a UUID field set:
		var UUID = this.object.fieldUUID(values);
		if (!values[UUID]) values[UUID] = this.object.application.uuid();


		return Promise.resolve()
			.then(()=>{
				// get localModel
				// localModel.create(values)
				return this.local()
					.create(values);
			})
			.then(()=>{
				this.object.emit("CREATE", values);
			})
//// QUESTION: do we make this process wait upon the 
//// .remote().create() to finish before this can be resolved?
//// or resolve after .emit() ?

			.then(()=>{
				// get remoteModel
				// .create()
				return this.remote().create(values);
			})
	}



	/**
	 * @method delete
	 * remove this model instance from from our local and remote storage
	 * @param {string} uuid  the .uuid of the instance to remove.
	 * @return {Promise}
	 */
	delete(id) {

		return Promise.resolve()
			.then(()=>{
				// delete from our local storage
				return this.local()
					.delete(id);
			})
			.then(()=>{
				this.object.emit("DELETE", id);
			})
			.then(()=>{
				// Delete from our Remote source
				return this.remote().delete(id);
			})
	}



	/**
	 * @method findAll
	 * performs a data find with the provided condition.
	 */
	findAll(cond) {

		cond = cond || {};

		// this is where the logic will get tricky:
		// As the platform implementation of .findAll()
		// we have to decide if we are storing/retrieving data
		// locally, remotely, or a combination of both.
		//
		// Those settings should be in AB.Policy.*
		// (however Policies aren't implemented at the moment so...)


		return Promise.resolve()
		.then(()=>{

			// if we are supposed to be working with remote data:
			// var serviceType = AB.Policy.[someParam]
			// var params = this.urlParamsFind(cond);
			// return AB.Comm[serviceType].get(params, {contextParam})

			// else 
			//	return [];


			// for now:
			var params = this.urlParamsFind(cond);
			var responseContext = this.responseContext; // this.object.application.cloneDeep(this.responseContext);
			responseContext.context.verb = 'find';
			return AB.Comm.Relay.get(params, responseContext)
			.then(()=>{
				// a relay doesn't return the data right away so:
				return [];
			})

		})
		.then((remoteData)=>{

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

		})

	}



	/**
	 * @method update
	 * update model values on the server.
	 */
	update(id, values) {

		this.prepareMultilingualData(values);

		values.updated_at = this.object.application.updatedAt();

		// remove empty properties
		for (var key in values) {
			if (values[key] == null)
				delete values[key];
		}

		return Promise.resolve()
			.then(()=>{
				// get localModel
				// localModel.create(values)
				return this.local()
					.update(id, values);
			})
			.then(()=>{
				this.object.emit("UPDATE", values);
			})
//// QUESTION: do we make this process wait upon the 
//// .remote().create() to finish before this can be resolved?
//// or resolve after .emit() ?

			.then(()=>{
				// get remoteModel
				// .create()
				return this.remote().update(id, values);
			})

	}


}
