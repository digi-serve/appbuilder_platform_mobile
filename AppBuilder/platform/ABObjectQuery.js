//
// ABObjectQuery
//
// A type of Object in our system that is based upon a complex relationship of multiple 
// existing Objects.  
//
// In the QueryBuilder section of App Builder, a new Query Object can be created.
// An initial Object can be chosen from our current list of Objects. After that, additional Objects
// and a specified join type can be specified.
//
// A list of fields from each specified Object can also be included as the data to be returned.
//
// A where statement is also part of the definition.
// 

var ABObjectQueryCore = require( "../core/ABObjectQueryCore" );

module.exports = class ABObjectQuery extends ABObjectQueryCore {

    constructor(attributes, application) {
    	super(attributes, application);

  	}



  	///
  	/// Static Methods
  	///
  	/// Available to the Class level object.  These methods are not dependent
  	/// on the instance values of the Application.
  	///





	///
	/// Instance Methods
	///


	/// ABApplication data methods


	/**
	 * @method destroy()
	 *
	 * destroy the current instance of ABObjectQuery
	 *
	 * also remove it from our parent application
	 *
	 * @return {Promise}
	 */
	destroy () {
		return this.application.queryDestroy(this);
	}


	/**
	 * @method save()
	 *
	 * persist this instance of ABObjectQuery with it's parent ABApplication
	 *
	 * @return {Promise}
	 *						.resolve( {this} )
	 */
	save () {

		var isAdd = false;

		// if this is our initial save()
		if (!this.id) {

			this.id = OP.Util.uuid();	// setup default .id
			this.label = this.label || this.name;
			this.urlPath = this.urlPath || this.application.name + '/' + this.name;
			isAdd = true;
		}

		return this.application.querySave(this);
	}





	///
	/// Fields
	///




	///
	/// Working with Client Components:
	///


	
	// return the column headers for this object
	// @param {bool} isObjectWorkspace  return the settings saved for the object workspace
	columnHeaders (isObjectWorkspace, isEditable, summaryColumns, countColumns) {
		
		var headers = super.columnHeaders(isObjectWorkspace, isEditable, summaryColumns, countColumns);

		headers.forEach(h => {

			var field = this.application.urlResolve(h.fieldURL);
			if (field) {

				// NOTE: query v1
				let alias = "";
				if (Array.isArray(this.joins())) {
					alias = field.object.name;
				}
				else {
					alias = h.alias;
				}

				// include object name {aliasName}.{columnName}
				// to use it in grid headers & hidden fields
				h.id = '{aliasName}.{columnName}'
						.replace('{aliasName}', alias)
						.replace('{columnName}', field.columnName);

				// label
				h.header = '{objectLabel}.{fieldLabel}'
							.replace('{objectLabel}', field.object.label)
							.replace('{fieldLabel}', field.label);

				// icon
				if (field.settings &&
					field.settings.showIcon) {
					h.header = '<span class="webix_icon fa fa-{icon}"></span>'.replace('{icon}', field.fieldIcon() ) + h.header;
				}

				h.adjust = true;
				h.minWidth = 220;
			}

		});

		return headers;
	}


}
