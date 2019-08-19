/**
 * ABDataCollection
 * 
 * This is the platform dependent implementation of ABObject.
 *
 */

var ABDataCollectionCore = require( "../core/ABDataCollectionCore" );


module.exports =  class ABDataCollection extends ABDataCollectionCore {

    constructor(attributes, application, page) {

    	super(attributes, application, page);

  	}



	/**
	 * @method remoteUpdate
	 * this alerts us of a change in our data that came from a remote
	 * source: socket update, Relay response, etc...
	 */
	remoteUpdate(data) {
		super.remoteUpdate(data)
		.then(()=>{

			// make sure local storage has these values in it:
			return this.datasource.model().local().localStorageStore(data);

		})
		
		
	}




	
	loadDataLocal(start, limit, callback) {

		var obj = this.datasource;
		if (obj == null) return Promise.resolve([]);

		var model = obj.model().local();
		if (model == null) return Promise.resolve([]);

		// reset the context on the Model so any data updates get sent to this
		// DataCollection
		// NOTE: we only do this on loadData(), other operations should be 
		// received by the related Objects.
		model.contextKey(ABDataCollectionCore.contextKey());
		model.contextValues({id:this.id});  // the datacollection.id


		var sorts = this.settings.objectWorkspace.sortFields || [];

		// pull filter conditions
		var wheres = this.settings.objectWorkspace.filterConditions;

		// set query condition
		var cond = {
			where: wheres,
			limit: limit || 20,
			skip: start || 0,
			sort: sorts,
		};

		// load all data
		if (this.settings.loadAll) {
			delete cond.limit;
		}

		// get data to data collection
		return model.findAll(cond)
			.then((data) => {

				return this.processIncomingData(data);
				
			}).then((data) => {

				if (callback)
					callback(null, data);

				return data;
			});

	}


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


}
