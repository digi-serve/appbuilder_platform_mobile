/*
 * ABField
 *
 * An ABField defines a single unique Field/Column in a ABObject.
 *
 * Update this definition for platform specific operations an ABField
 * can perform.
 *
 */

var ABFieldCore = require("../../core/dataFields/ABFieldCore");

module.exports = class ABField extends ABFieldCore {
   constructor(values, object, fieldDefaults) {
      super(values, object, fieldDefaults);

      //  	// NOTE: setup this first so later we can use .fieldType(), .fieldIcon()
      //  	this.defaults = fieldDefaults;

      // 	{
      // 		id:'uuid',					// uuid value for this obj
      // 		key:'fieldKey',				// unique key for this Field
      // 		icon:'font',				// fa-[icon] reference for an icon for this Field Type
      // 		label:'',					// pulled from translation
      // 		columnName:'column_name',	// a valid mysql table.column name
      //		settings: {					// unique settings for the type of field
      // 			showIcon:true/false,	// only useful in Object Workspace DataTable
      // 			isImported: 1/0,		// flag to mark is import from other object
      // 			required: 1/0,			// field allows does not allow NULL or it does allow NULL
      // 			width: {int}			// width of display column

      // 		// specific for dataField
      // 		},
      // 		translations:[]
      // 	}
   }

   ///
   /// Instance Methods
   ///
};
