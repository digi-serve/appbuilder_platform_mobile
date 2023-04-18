/**
 * ABDataCollection
 *
 * This is the platform dependent implementation of ABObject.
 *
 */

var ABDataCollectionCore = require("../core/ABDataCollectionCore");

var ABQL = require("./qlOld/ABQL");

var Account = require("../../resources/Account").default;
var Analytics = require("../../resources/Analytics").default;
var Network = require("../../resources/Network").default;
var storage = require("../../resources/Storage").storage;

module.exports = class ABDataCollection extends ABDataCollectionCore {
   constructor(attributes, application, page) {
      super(attributes, application, page);

      this.bootState = "??";
      // bootState represents where we are on the platform setup.
      // "uninitialized":
      //      the first time an app is loaded, none of our Datacollections
      //      have requested their initial data from the server, so they
      //      are considered "uninitialized".
      //
      // "initialized":
      //      after data from the server has been requested the 1st time,
      //      then there is some local data that we can use to begin
      //      operating with.
      //
      // these values are setup during: .platformInit()

      this.__bindComponentIds = [];
      // __bindComponentIds is an array of other components.id that have .bind()
      // this ABViewDataCollection.

      this.__dataCollection = this._dataCollectionNew();

      // Setup a listener for this DC to catch updates from the relay
      Network.on(ABDataCollectionCore.contextKey(), (context, data) => {
         // is this update for me?
         if (context.id == this.id) {
            //console.log("-----------");
            // console.log(
            //    ":: ABApplication.Relay.on:" + ABDataCollectionCore.contextKey()
            // );
            if (data.error) {
               // data was returned, with error message
               data["objectName"] = this.name;
               console.error(data);
            }
            if (this.name) {
               console.log(":: name:", this.name, {
                  ":: context:": context,
                  ":: data:": data
               });
            } else {
               console.log(":: context", context, {
                  ":: data": data
               });
            }
            var firstStep;
            // will be a Promise based on which of the next steps
            // should be executed.

            // if context is from a "uninitialized" state
            //    OR this datacollection is a Server Centric set of data:
            //    OR this is a Query based datacollection
            if (
               context.verb == "uninitialized" ||
               this.isServerPreferred() ||
               this.settings.isQuery
            ) {
               // we need to just accept all the data that came in.
               firstStep = this.datasource
                  .model()
                  .local()
                  .syncRemoteMaster(data);
            } else {
               // this is a refresh, with local data that is Preferred:
               firstStep = this.datasource
                  .model()
                  .local()
                  .syncLocalMaster(data);
            }

            firstStep
               .then((normalizedData) => {
                  if (this.isServerPreferred()) {
                     this.reduceCondition(normalizedData);
                  }
                  return normalizedData;
               })
               .then((normalizedData) => {
                  this.processIncomingData(normalizedData);
                  return normalizedData;
               })
               .then((normalizedData) => {
                  if (context.verb != "uninitialized") {
                     this.emit("REFRESH");
                  }

                  // signal our remote data has arrived.
                  this.emit("init.remote", {});

                  // TODO: Legacy: remove this once Events and HRIS are upgraded
                  this.emit("data", normalizedData);
               });
         }
      }); // end Network.on()

      //// TODO: test out these OBJ.on() propagations:
      var OBJ = this.datasource;
      if (OBJ) {
         OBJ.on("CREATE", (data) => {
            // if valid for this DC
            if (this.__filterDatasource.isValid(data)) {
               // find which field is the PK
               var PK = this.datasource.fieldUUID(data);

               // if entry NOT currently in datacollection
               if (!this.__dataCollection.exists(data[PK])) {
                  // webix datacollections need an .id field
                  if (!data.id) {
                     data.id = data[PK];
                  }

                  // include it in our list:
                  this.__dataCollection.add(data);

                  // alert anyone attached to us that we have CREATEd
                  // data.
                  this.emit("CREATE", data);
               }
            }
         });

         OBJ.on("UPDATE", (data) => {
            // find which field is the PK
            var PK = this.datasource.fieldUUID(data);
            var ID = data[PK];

            // if entry IS currently in datacollection
            if (this.__dataCollection.exists(ID)) {
               // update our copy
               this.__dataCollection.updateItem(ID, data);

               // alert anyone attached to us that we have UPDATEd
               // data.
               this.emit("UPDATE", data);
            }
         });

         OBJ.on("DELETE", (ID) => {
            // if entry IS currently in datacollection
            if (this.__dataCollection.exists(ID)) {
               // remove it from our list:
               this.__dataCollection.remove(ID);

               // if I'm maintaining a set of reducedConditions:
               var remainingEntries = this.QL().value();
               this.reduceCondition(remainingEntries);

               // alert anyone attached to us that we have DELETEd
               // data.
               this.emit("DELETE", ID);
            }
         });
      }
   }

   /**
    * isServerPreferred()
    * return true if this data is primarily Server side data. Server side data
    * that is different than the copy we have locally should overwrite our
    * local data.
    * @return {bool}
    */
   isServerPreferred() {
      return this.settings.syncType == "1" || this.settings.syncType == 1;
      // NOTE: syncType = "2" is client preferred.
   }

   /**
    * @method dataCollectionRefresh
    * create a data collection to cache
    *
    * @return {Promise}
    *           .resolve()
    */
   init() {
      // prevent initialize many times
      if (this.initialized) return;

      super.init();

      // __dataCollection must implement these methods:
      // .add( {data}, indx)
      // .attachEvent("onAfterCursorChange", fn);
      // .clearAll()
      // .exists( ID )
      // .filter( fn )
      // .find( fn, bool)
      // .find({})
      // .getCursor(): return the id of the item the cursor is on
      // .getFirstId()
      // .getItem( ID ) : the row of data for row.id == ID
      // .getNextId(ID) : ID = the current row, that you want the Next one for
      // .parse({ data:[] })
      // .remove( ID )
      // .setCursor( ID )
      // .updateItem(ID, {data})

      /*
//// TODO: transferr these to our AB.comm.relay.*

        // events: tie our devined on "ab.datacollection.create" to the 
        // platform specified event notification.
        AD.comm.hub.subscribe('ab.datacollection.create', (msg, data) => {
            this.emit("ab.datacollection.create", msg, data);
        });

        AD.comm.hub.subscribe('ab.datacollection.update', (msg, data) => {
            this.emit("ab.datacollection.update", msg, data);
        });

        // We are subscribing to notifications from the server that an item may be stale and needs updating
        // We will improve this later and verify that it needs updating before attempting the update on the client side
        AD.comm.hub.subscribe('ab.datacollection.stale', (msg, data) => {
            this.emit("ab.datacollection.stale", msg, data);
        });

        AD.comm.hub.subscribe('ab.datacollection.delete', (msg, data) => {
            this.emit("ab.datacollection.delete", msg, data);
        });
*/
   }

   /**
    * reduceCondition()
    * take the provided data and track the id's of the entries.
    * Later when performing filter.isValid() operations, we can use this
    * instead of trying to parse through embedded queries and filters...
    * @param {array} values ABObject values that represent the data for this query.
    * @return {Promise} resolved when conditions are stored
    */
   reduceCondition(values) {
      new Promise((resolve, reject) => {
         var pk = this.datasource.PK();
         if (!Array.isArray(values)) values = [values];
         var listIDs = values.map((v) => {
            return v[pk];
         });
         this._reducedConditions = {
            pk: pk,
            values: listIDs
         };

         if (this.__filterDatasource) {
            this.__filterDatasource.setReducedConditions(
               this._reducedConditions
            );
         }

         //
         //  save these to disk
         //
         var lock = storage.Lock(this.refStorage());
         return lock
            .acquire()
            .then(() => {
               return storage.get(this.refStorage()).then((data) => {
                  // shouldn't have uninitialized data at this point,
                  // but just in case:
                  data = data || {};

                  data.reducedConditions = this._reducedConditions;

                  return storage.set(this.refStorage(), data);
               });
            })
            .then(() => {
               lock.release();
            });
      });
   }

   /**
    * addReducedConditionEntry()
    * used to add a single entry to our reduced conditions clause.
    * this adds it to the already existing list.
    * @param {obj} entry
    * @return {Promise}
    */
   addReducedConditionEntry(entry) {
      // insert ID into our current list of reducedConditions
      var pk = this.datasource.PK();
      var ID = entry[pk];
      this._reducedConditions.values.push(ID);

      // create a new set of values we can send to .reduceCondition()
      // to properly update the filter and data storage.
      var mockValues = [];
      this._reducedConditions.values.forEach((val) => {
         var obj = {};
         obj[pk] = val;
         mockValues.push(obj);
      });

      return this.reduceCondition(mockValues);
   }

   /**
    * platformInit
    * make sure we are ready for operation on this platform.
    * this implies we need to make sure each ABObject we use can
    * store information in the DB.  This is done in the
    * object.model().local()
    * @return {Promise}
    */
   platformInit() {
      return new Promise((resolve, reject) => {
         // Make sure our ABObject is properly setup on the platform
         var ds = this.datasource;
         if (!ds) {
            // if we couldn't find the reference to our datasource
            // someone should know about this!
            var dsError = new Error(
               "ABViewDataCollection:platformInit(): unknown datasource"
            );
            dsError.context = { settings: this.settings };
            Analytics.logError(dsError);

            // but continue on just in case this is a dangling DC
            // that isn't actually being used.
            resolve();
            return;
         }

         ds.model()
            .local()
            .platformInit()
            .then(() => {
               // once that is done, make sure we can track our DC info
               var lock = storage.Lock(this.refStorage());
               return lock
                  .acquire()
                  .then(() => {
                     return storage.get(this.refStorage()).then((data) => {
                        // if we already have our storage set:
                        if (data) {
                           this.bootState = data.bootState;
                           this._reducedConditions = data.reducedConditions;

                           if (this._reducedConditions) {
                              if (this.__filterDatasource) {
                                 this.__filterDatasource.setReducedConditions(
                                    this._reducedConditions
                                 );
                              }
                           }
                           return;
                        } else {
                           // this must be our 1st time through.
                           // our bootState should be "uninitialized" until
                           // we get our 1st response from the Server:
                           this.bootState = "uninitialized";
                           this._reducedConditions = null;

                           // save our info:
                           return storage.set(this.refStorage(), {
                              bootState: this.bootState,
                              reducedConditions: this._reducedConditions
                           });
                        }
                     });
                  })
                  .then(() => {
                     lock.release();
                  });
            })
            .then(() => {
               resolve();
            })
            .catch(reject);
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
         // Make sure our ABObject is properly setup on the platform
         this.datasource
            .model()
            .local()
            .platformReset()
            .then(() => {
               // once that is done, make sure we can clear our DC info
               var lock = storage.Lock(this.refStorage());
               return lock
                  .acquire()
                  .then(() => {
                     return storage.set(this.refStorage(), null);
                  })
                  .then(() => {
                     lock.release();
                  });
            })
            .then(() => {
               // now clear all our live values:
               this.clearAll();
               resolve();
            })
            .catch(reject);
      });
   }

   /**
    * processIncomingData()
    * is called from loadData() once the data is returned.  This method
    * allows the platform to make adjustments to the data based upon any
    * platform defined criteria.
    * @param {obj} data  the data as it was returned from the Server
    *        which should be in following format:
    *        {
    *          status: "success", // or "error"
    *          data:[ {ABObjectData}, {ABObjectData}, ...]
    *        }
    */
   processIncomingData(data) {
      //// Web Platform:
      // // standardize the heights
      // data.data.forEach((d) => {

      //     // define $height of rows to render in webix elements
      //     if (d.properties != null && d.properties.height != "undefined" && parseInt(d.properties.height) > 0) {
      //         d.$height = parseInt(d.properties.height);
      //     } else if (defaultHeight > 0) {
      //         d.$height = defaultHeight;
      //     }

      // });

      return super.processIncomingData(data).then(() => {
         //// Web Platform:
         // // when that is done:
         // this.hideProgressOfComponents();

         // make sure we update our bootState!
         if (this.bootState == "uninitialized") {
            this.bootState = "initialized";

            // once that is done, make sure we can track our DC info
            var lock = storage.Lock(this.refStorage());
            return lock
               .acquire()
               .then(() => {
                  return storage.get(this.refStorage()).then((data) => {
                     data = data || {};
                     data.bootState = this.bootState;

                     return storage.set(this.refStorage(), data);
                  });
               })
               .then(() => {
                  lock.release();
               });
         }
      });
   }

   /**
    * refStorage
    * return a unique key for this datacollection for our storage key.
    * we will store information about our DC here like:
    *      "bootState" :  [ "uninitialized", "initialized" ]
    * @return {string}
    */
   refStorage() {
      return "dc-" + this.id;
   }

   /**
    * @method remoteUpdate
    * this alerts us of a change in our data that came from a remote
    * source: socket update, Relay response, etc...
    */
   remoteUpdate(data) {
      super.remoteUpdate(data).then(() => {
         // make sure local storage has these values in it:
         return this.datasource
            .model()
            .local()
            .localStorageStore(data);
      });
   }

   /**
    * currentUserUsername
    * must return the proper value for the current user that would match a "user" field
    * in an object.
    * This is platform dependent, so must be implemented by a child object.
    * @return {string}
    */
   currentUserUsername() {
      console.error("Who is calling .currentUserUsername()?");
      return Account.username;
   }

   loadDataDelayed() {
      if (!this._pendingLoadData) {
         this._pendingLoadData = setTimeout(() => {
            this.loadData();
            delete this._pendingLoadData;
         }, 1000);
      } else {
         clearTimeout(this._pendingLoadData);
         delete this._pendingLoadData;
         this.loadDataDelayed();
      }
   }
   // loadDataLocal(start, limit, callback) {
   //    var obj = this.datasource;
   //    if (obj == null) return Promise.resolve([]);

   //    var model = obj.model().local();
   //    if (model == null) return Promise.resolve([]);

   //    // reset the context on the Model so any data updates get sent to this
   //    // DataCollection
   //    // NOTE: we only do this on loadData(), other operations should be
   //    // received by the related Objects.
   //    model.contextKey(ABDataCollectionCore.contextKey());
   //    model.contextValues({ id: this.id }); // the datacollection.id

   //    var sorts = this.settings.objectWorkspace.sortFields || [];

   //    // pull filter conditions
   //    var wheres = this.settings.objectWorkspace.filterConditions;

   //    // set query condition
   //    var cond = {
   //       where: wheres,
   //       limit: limit || 20,
   //       skip: start || 0,
   //       sort: sorts
   //    };

   //    // load all data
   //    if (this.settings.loadAll) {
   //       delete cond.limit;
   //    }

   //    // get data to data collection
   //    console.error("Where is .loadDataLocal() being called from?");
   //    debugger;

   //    return model
   //       .findAll(cond)
   //       .then((data) => {
   //          return this.processIncomingData(data);
   //       })
   //       .then((data) => {
   //          if (callback) callback(null, data);

   //          return data;
   //       });
   // }

   //// These seem to be all Webix specific operations:

   // /**
   //  * @method bind
   //  *
   //  *
   //  * @param {Object} component - a webix element instance
   // */
   // bind(component) {

   // 	var dc = this.__dataCollection;
   // 	var obj = this.datasource;

   // 	if (component.config.view == 'datatable') {
   // 		if (dc) {
   // 			component.define("datafetch", 20);
   // 			component.define("datathrottle", 500);

   // 			component.data.sync(dc);

   // 			// Implement .onDataRequest for paging loading
   // 			if (!this.settings.loadAll) {

   // 				component.___AD = component.___AD || {};
   // 				if (component.___AD.onDataRequestEvent) component.detachEvent(component.___AD.onDataRequestEvent);
   // 				component.___AD.onDataRequestEvent = component.attachEvent("onDataRequest", (start, count) => {

   // 					// load more data to the data collection
   // 					dc.loadNext(count, start);

   // 					return false;	// <-- prevent the default "onDataRequest"
   // 				});

   // 			}

   // 		} else {
   // 			component.data.unsync();
   // 		}
   // 	}
   // 	else if (component.bind) {
   // 		if (dc) {
   // 			// Do I need to check if there is any data in the collection before binding?
   // 			component.bind(dc);
   // 		} else {
   // 			component.unbind();
   // 		}
   // 	}

   // 	component.refresh();

   // }

   // clone(settings) {
   // 	settings = settings || this.toObj();
   // 	var clonedDataCollection = new ABDataCollection(settings, this.application, this.parent);

   // 	return new Promise((resolve, reject)=>{

   // 		// load the data
   // 		clonedDataCollection.loadData()
   // 		.then(()=>{

   // 			// set the cursor
   // 			var cursorID = this.getCursor();

   // 			if (cursorID) {
   // 				// NOTE: webix documentation issue: .getCursor() is supposed to return
   // 				// the .id of the item.  However it seems to be returning the {obj}
   // 				if (cursorID.id) cursorID = cursorID.id;

   // 				clonedDataCollection.setCursor(cursorID);
   // 			}

   // 			resolve( clonedDataCollection );
   // 		})
   // 		.catch(reject);
   // 	})
   // }

   // filteredClone(filters) {
   // 	var obj = this.toObj();

   // 	// check to see that filters are set (this is sometimes helpful to select the first record without doing so at the data collection level)
   // 	if (typeof filters != "undefined") {
   // 		obj.settings.objectWorkspace.filterConditions = { glue:'and', rules:[ obj.settings.objectWorkspace.filterConditions, filters ]}
   // 	}

   // 	return this.clone(obj); // new ABViewDataCollection(settings, this.application, this.parent);

   // }

   // setCursor(rowId) {

   // 	// If the static cursor is set, then this DC could not set cursor to other rows
   // 	if (this.settings.fixSelect &&
   // 		this.settings.fixSelect != rowId)
   // 		return;

   // 	var dc = this.__dataCollection;
   // 	if (dc) {

   // 		if (dc.getCursor() != rowId)
   // 			dc.setCursor(rowId);
   // 		// If set rowId equal current cursor, it will not trigger .onAfterCursorChange event
   // 		else
   // 			this.emit("changeCursor", rowId);
   // 	}

   // }

   // getCursor() {

   // 	var dc = this.__dataCollection;
   // 	if (dc) {

   // 		var currId = dc.getCursor();
   // 		var currItem = dc.getItem(currId);

   // 		return currItem;
   // 	}
   // 	else {
   // 		return null;
   // 	}

   // }

   // getFirstRecord() {

   // 	var dc = this.__dataCollection;
   // 	if (dc) {

   // 		var currId = dc.getFirstId();
   // 		var currItem = dc.getItem(currId);

   // 		return currItem;
   // 	}
   // 	else {
   // 		return null;
   // 	}

   // }

   // getNextRecord(record) {

   // 	var dc = this.__dataCollection;
   // 	if (dc) {

   // 		var currId = dc.getNextId(record.id);
   // 		var currItem = dc.getItem(currId);

   // 		return currItem;
   // 	}
   // 	else {
   // 		return null;
   // 	}

   // }

   // loadData(start, limit, callback) {

   // 	var obj = this.datasource;
   // 	if (obj == null) return Promise.resolve([]);

   // 	var model = obj.model();
   // 	if (model == null) return Promise.resolve([]);

   // 	var sorts = this.settings.objectWorkspace.sortFields || [];

   // 	// pull filter conditions
   // 	var wheres = this.settings.objectWorkspace.filterConditions;
   // 	// var wheres = [];
   // 	// var filterConditions = this.settings.objectWorkspace.filterConditions || ABViewPropertyDefaults.objectWorkspace.filterConditions;
   // 	// (filterConditions.rules || []).forEach((f) => {

   // 	// 	// Get field name
   // 	// 	var fieldName = "";
   // 	// 	if (f.fieldId == 'this_object') {
   // 	// 		fieldName = f.fieldId;
   // 	// 	} else {
   // 	// 		var object = this.datasource;
   // 	// 		if (object) {
   // 	// 			var selectField = object.fields(field => field.id == f.fieldId)[0];
   // 	// 			fieldName = selectField ? selectField.columnName : "";
   // 	// 		}
   // 	// 	}

   // 	// 	wheres.push({
   // 	// 		combineCondition: filterConditions.combineCondition,
   // 	// 		fieldName: fieldName,
   // 	// 		operator: f.operator,
   // 	// 		inputValue: f.inputValue
   // 	// 	});

   // 	// });

   // 	// calculate default value of $height of rows
   // 	var defaultHeight = 0;
   // 	var minHeight = 0;
   // 	var imageFields = obj.fields((f) => f.key == 'image');
   // 	imageFields.forEach(function (f) {
   // 		if (parseInt(f.settings.useHeight) == 1 && parseInt(f.settings.imageHeight) > minHeight) {
   // 			minHeight = parseInt(f.settings.imageHeight) + 20;
   // 		}
   // 	});
   // 	if (minHeight > 0) {
   // 		defaultHeight = minHeight;
   // 	}

   // 	// set query condition
   // 	var cond = {
   // 		where: wheres,
   // 		limit: limit || 20,
   // 		skip: start || 0,
   // 		sort: sorts,
   // 	};

   // 	// load all data
   // 	if (this.settings.loadAll) {
   // 		delete cond.limit;
   // 	}

   // 	// get data to data collection
   // 	return model.findAll(cond)
   // 		.then((data) => {

   // 			return new Promise((resolve, reject)=>{

   // 				data.data.forEach((d) => {

   // 					// define $height of rows to render in webix elements
   // 					if (d.properties != null && d.properties.height != "undefined" && parseInt(d.properties.height) > 0) {
   // 						d.$height = parseInt(d.properties.height);
   // 					} else if (defaultHeight > 0) {
   // 						d.$height = defaultHeight;
   // 					}

   // 				});

   // 				this.__dataCollection.parse(data);

   // 				// set static cursor
   // 				if (this.settings.fixSelect) {

   // 					// set cursor to the current user
   // 					if (this.settings.fixSelect == "_CurrentUser") {

   // 						var username = OP.User.username();
   // 						var userFields = this.datasource.fields((f) => f.key == "user");

   // 						// find a row that contains the current user
   // 						var row = this.__dataCollection.find((r) => {

   // 							var found = false;

   // 							userFields.forEach((f) => {

   // 								if (found || r[f.columnName] == null) return;

   // 								if (r[f.columnName].filter) { // Array - isMultiple
   // 									found = r[f.colName].filter((data) => data.id == username).length > 0;
   // 								}
   // 								else if (r[f.columnName] == username) {
   // 									found = true;
   // 								}

   // 							});

   // 							return found;

   // 						}, true);

   // 						// set a first row of current user to cursor
   // 						if (row)
   // 							this.__dataCollection.setCursor(row.id);
   // 					} else if (this.settings.fixSelect == "_FirstRecord") {
   // 						// find a row that contains the current user
   // 						var row = this.__dataCollection.find((r) => {

   // 							var found = false;
   // 							if (!found) {
   // 								found = true;
   // 								return true; // just give us the first record
   // 							}

   // 						}, true);

   // 						// set a first row of current user to cursor
   // 						if (row)
   // 							this.__dataCollection.setCursor(row.id);
   // 					} else {
   // 						this.setCursor(this.settings.fixSelect);
   // 					}

   // 				}

   // 				var linkDc = this.dataCollectionLink;
   // 				if (linkDc) {

   // 					// filter data by match link data collection
   // 					var linkData = linkDc.getCursor();
   // 					this.filterLinkCursor(linkData);

   // 					// add listeners when cursor of link data collection is changed
   // 					this.eventAdd({
   // 						emitter: linkDc,
   // 						eventName: "changeCursor",
   // 						listener: (currData) => {
   // 							this.filterLinkCursor(currData);
   // 						}
   // 					});

   // 				}

   // 				resolve();

   // 			});

   // 		}).then(() => {
   // 			return new Promise((resolve, reject)=>{
   // 				if (callback)
   // 					callback();

   // 				resolve();
   // 			});
   // 		});

   // 	// if (callback) {
   // 	// 	Promise.all([dataFetch]).then(function(values) {
   // 	// 		callback();
   // 	// 	});
   // 	// } else {
   // 	// 	return dataFetch;
   // 	// }

   // }

   // reloadData() {
   // 	this.__dataCollection.clearAll();
   // 	return this.loadData(null, null, null);
   // }

   // getData(filter) {

   // 	var dc = this.__dataCollection;
   // 	if (dc) {

   // 		return dc.find(filter || {});
   // 	}
   // 	else {
   // 		return [];
   // 	}

   // }

   /** Private methods */

   /**
    * @method _dataCollectionNew
    * Get webix.DataCollection
    *
    * @return {webix.DataCollection}
    *
    * @param {Array} data - initial data
    */
   _dataCollectionNew(data) {
      // get a webix data collection
      let dc = new webix.DataCollection({
         data: data || []
      });

      this._extendCollection(dc);

      return dc;
   }

   _extendCollection(dataStore) {
      // Apply this data collection to support multi-selection
      // https://docs.webix.com/api__refs__selectionmodel.html
      webix.extend(dataStore, webix.SelectionModel);

      dataStore.___AD = dataStore.___AD || {};

      // Implement .onDataRequest for paging loading
      if (!this.settings.loadAll) {
         if (!dataStore.___AD.onDataRequestEvent) {
            dataStore.___AD.onDataRequestEvent = dataStore.attachEvent(
               "onDataRequest",
               (start, count) => {
                  if (start < 0) start = 0;

                  // load more data to the data collection
                  this.loadData(start, count);

                  return false; // <-- prevent the default "onDataRequest"
               }
            );
         }

         if (!dataStore.___AD.onAfterLoadEvent) {
            dataStore.___AD.onAfterLoadEvent = dataStore.attachEvent(
               "onAfterLoad",
               () => {
                  this.emit("loadData", {});
               }
            );
         }
      }

      // override unused functions of selection model
      dataStore.addCss = function() {};
      dataStore.removeCss = function() {};
      dataStore.render = function() {};

      // NOTE: this doesn't seem relevant on the Mobile Platform:
      // if (!dataStore.___AD.onAfterLoad) {
      //    dataStore.___AD.onAfterLoad = dataStore.attachEvent(
      //       "onAfterLoad",
      //       () => {
      //          this.hideProgressOfComponents();
      //       }
      //    );
      // }
   }

   /////
   ///// MOBILE Platform Changes
   /////
   ///// These changes will eventually make it into the ABDataCollectionCore
   ///// once the web and server side platforms are updated to be able to handle
   ///// modelLocal, modelRemote operations.

   platformFind(model, cond) {
      // if (bootstate==initialzied) {
      if (this.bootState == "initialized") {
         // We have already initialized our data, so that means
         // we have local data that we can work with right now.

         // NOTE: we will get all the local data for our Object
         // and let our filterComponent tell us if it should be
         // included:
         var modelLocal = model.local();
         return modelLocal
            .findAll(cond)
            .then((entries) => {
               var validEntries = [];
               entries.forEach((entry) => {
                  // add it to our list if it passes our filter:
                  if (this.__filterDatasource.isValid(entry)) {
                     validEntries.push(entry);
                  }
               });

               // load our valid entries:
               this.processIncomingData(validEntries);

               // we can start working on this data now
               // NOTE: resolve() should be done in .processIncomingData() now
               // resolve();
            })
            .then(() => {
               // However, this local data might be out of date
               // with the server.  So let's spawn a remote
               // lookup in the background:

               var modelRemote = model.remote();

               // reset the context on the Model so any data updates get sent to this
               // DataCollection
               // NOTE: we only do this on loadData(), other operations should be
               // received by the related Objects.
               modelRemote.contextKey(ABDataCollectionCore.contextKey());
               modelRemote.contextValues({
                  id: this.id,
                  verb: "refresh"
               });
               // id: the datacollection.id
               // verb: tells our ABRelay.listener why this remote lookup was called.

               // initiate the request:
               modelRemote.findAll(cond);
            });
      } else {
         //  We have not been initialized yet, so we need to
         //  request our data from the remote source()
         var modelRemote = model.remote();

         // reset the context on the Model so any data updates get sent to this
         // DataCollection
         // NOTE: we only do this on loadData(), other operations should be
         // received by the related Objects.
         modelRemote.contextKey(ABDataCollectionCore.contextKey());
         modelRemote.contextValues({
            id: this.id,
            verb: "uninitialized"
         });
         // id: the datacollection.id
         // verb: tells our ABRelay.listener why this remote lookup was called.

         // initiate the request:
         return modelRemote.findAll(cond);
         // note:  our ABRelay.listener will take incoming data and call:
         // this.processIncomingData()
      }
   }

   /**
    * loadData
    * used by the webix data collection to import all the data
    * the only time start, limit are set, is when the settings.loadAll
    * is false, and then we use the datacollection's paging feature.
    * @param {int} start  the index of the row tostart at (0 based)
    * @param {int} limit  the limit of # of rows to return each call
    * @param {fn}  callback  a node style callback fn(err, results)
    * @return {Promise}
    */
   /*
   loadData(start, limit, callback) {
      // mark data status is initializing
      if (this._dataStatus == this.dataStatusFlag.notInitial) {
         this._dataStatus = this.dataStatusFlag.initializing;
         this.emit("initializingData", {});
      }

      var obj = this.datasource;
      if (obj == null) {
         this._dataStatus = this.dataStatusFlag.initialized;
         return Promise.resolve([]);
      }

      var model = obj.model();
      if (model == null) {
         this._dataStatus = this.dataStatusFlag.initialized;
         return Promise.resolve([]);
      }

      // pull the defined sort values
      var sorts = this.settings.objectWorkspace.sortFields || [];

      // pull filter conditions
      var wheres = this.settings.objectWorkspace.filterConditions;

      // // calculate default value of $height of rows
      // var defaultHeight = 0;
      // var minHeight = 0;
      // var imageFields = obj.fields((f) => f.key == 'image');
      // imageFields.forEach(function (f) {
      //  if (parseInt(f.settings.useHeight) == 1 && parseInt(f.settings.imageHeight) > minHeight) {
      //     minHeight = parseInt(f.settings.imageHeight) + 20;
      //  }
      // });
      // if (minHeight > 0) {
      //  defaultHeight = minHeight;
      // }

      // set query condition
      var cond = {
         where: wheres,
         // limit: limit || 20,
         skip: start || 0,
         sort: sorts
      };

      //// NOTE: we no longer set a default limit on loadData() but
      //// require the platform.loadData() to pass in a default limit.
      if (limit) {
         cond.limit = limit;
      }

      // if settings specify loadAll, then remove the limit
      if (this.settings.loadAll) {
         delete cond.limit;
      }

      /*
       * waitForDataCollectionToInitialize()
       * there are certain situations where this datacollection shouldn't
       * load until another one has loaded.  In those cases, the fn()
       * will wait for the required datacollection to emit "initializedData"
       * before continuing on.
       * @param {ABViewDataCollection} DC
       *       the DC this datacollection depends on.
       * @returns {Promise}
       * /
      var waitForDataCollectionToInitialize = (DC) => {
         return new Promise((resolve, reject) => {
            switch (DC.dataStatus) {
               // if that DC hasn't started initializing yet, start it!
               case DC.dataStatusFlag.notInitial:
                  DC.loadData().catch(reject);
               // no break;

               // once in the process of initializing
               case DC.dataStatusFlag.initializing:
                  // listen for "initializedData" event from the DC
                  // then we can continue.
                  this.eventAdd({
                     emitter: DC,
                     eventName: "initializedData",
                     listener: () => {
                        // go next
                        resolve();
                     }
                  });
                  break;

               // if it is already initialized, we can continue:
               case DC.dataStatusFlag.initialized:
                  resolve();
                  break;

               // just in case, if the status is not known, just continue
               default:
                  resolve();
                  break;
            }
         });
      };

      return (
         Promise.resolve()
            //
            // Step 1: make sure any DataCollections we are linked to are
            // initialized first.  Then proceed with our initialization.
            //
            .then(() => {
               // If we are linked to another datacollection then wait for it
               let linkDc = this.dataCollectionLink;
               if (!linkDc) return;

               return waitForDataCollectionToInitialize(linkDc);
            })
            //
            // Step 2: if we have any filter rules that depend on other DataCollections,
            // then wait for them to be initialized first.
            // eg: "(not_)in_data_collection" rule filters
            .then(() => {
               return new Promise((resolve, reject) => {
                  if (
                     wheres == null ||
                     wheres.rules == null ||
                     !wheres.rules.length
                  )
                     return resolve();

                  var dcFilters = [];

                  wheres.rules.forEach((rule) => {
                     // if this collection is filtered by data collections we need to load them in case we need to validate from them later
                     if (
                        rule.rule == "in_data_collection" ||
                        rule.rule == "not_in_data_collection"
                     ) {
                        var dc = this.application.datacollections(
                           (dc) => dc.id == rule.value
                        )[0];
                        if (dc) {
                           dcFilters.push(
                              waitForDataCollectionToInitialize(dc)
                           );
                        }
                     }
                  });

                  Promise.all(dcFilters)
                     .then(() => {
                        resolve();
                     })
                     .catch(reject);
               });
            })
            //
            // Step 3: Now we can pull data to this DataCollection
            //
            .then(() => {
               return new Promise((resolve, reject) => {
                  // we will keep track of the resolve, reject for this
                  // operation.
                  this._pendingLoadDataResolve = {
                     resolve: resolve,
                     reject: reject
                  };
               });
            })
      );
   }
*/
   //
   // Query Interface
   //

   QL() {
      var params = {
         key: ABQL.common().key,
         dc: this.id
      };
      return this.application.qlopNew(params);
   }
};
