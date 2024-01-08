/*
 * ABQL
 *
 * An ABQL defines a Query Language Operation. A QL Operation
 * is intended to be evaluated at run time and return a value that can be
 * assigned to form value or an object.
 *
 * This object starts with an ABViewDataCollection and exposes programmatic
 * query operations on that datacollection.
 *
 *
 */

var ABQLDefaults = {
   key: "qlbase" // {string} unique key for this view
};

module.exports = class ABQL {
   /**
    * @param {obj} values  key=>value hash of ABView values
    * @param {ABApplication} application the application object this view is under
    * @param {ABView} parent the ABView this view is a child of. (can be null)
    * @param {obj} defaultValues special sub class defined default values.
    */
   constructor(values, application, parent, defaultValues) {
      // values:
      // {
      // 	key:'qlbase',
      // 	dc: "DataCollectionKey"
      //  data: {multi} || null
      // }

      defaultValues = defaultValues || ABQLDefaults;

      this.application = application || null;
      this.parent = parent || null;

      // the ABViewDataCollection this ABQL object is associated with.
      this.datacollection = null;
      if (this.application) {
         if (values.dc) {
            this.datacollection = this.application.datacollectionByID(
               values.dc
            );
         }
      }

      // the working data for this ABQL object.
      this.data = null;
      if (values.data) {
         this.data = values.data;
      } else {
         this.data = this.datacollection.getAllRecords();
      }
   }

   static common() {
      return ABQLDefaults;
   }

   ///
   /// Instance Methods
   ///

   /// ABApplication data methods

   /**
    * @method toObj()
    *
    * properly compile the current state of this ABView instance
    * into the values needed for saving to the DB.
    *
    * @return {json}
    */
   toObj() {
      OP.Multilingual.unTranslate(this, this, ["label"]);

      var result = {};

      return result;
   }

   /**
    * @method fromValues()
    *
    * initialze this object with the given set of values.
    * @param {obj} values
    */
   fromValues(values) {
      super.fromValues(values);

      this.key = values.key || this.viewKey();
      this.icon = values.icon || this.viewIcon();

      // label is a multilingual value:
      OP.Multilingual.translate(this, this, ["label"]);

      // default value for our label
      if (this.label == "?label?") {
         if (this.parent) {
            this.label = this.parent.label + "." + this.defaults.key;
         }
      }

      // var views = [];
      // (values.views || []).forEach((child) => {
      // 	// views.push(ABViewManager.newView(child, this.application, this));
      // 	views.push(this.application.viewNew(child, this.application, this));
      // })
      // this._views = views;
   }

   /**
    * first()
    * work with the first object in our collection of data.
    * @return {ABQLObject}
    */
   first() {
      var firstItem = this.datacollection.getData()[0];

      var param = {
         key: "qlobject",
         // is there a better way to reference this without creating circular
         // dependencies?
         dc: this.datacollection.id,
         data: firstItem || null
      };
      return this.application.qlopNew(param, this.application, this);
   }

   /**
    * nullValue
    * return a null ABQLObject
    * @return {ABQLObject}
    */
   nullValue(OBJ) {
      var param = {
         key: OBJ.common().key,
         dc: this.datacollection.id,
         data: null
      };
      return new OBJ(param, this.application, this);
   }

   /**
    * reload
    * reload the data for this QL object. This will be called on C/U/D
    * @return {Promise}
    *        resolve() : {array} of data
    */
   reload() {
      return new Promise((resolve, reject) => {
         this.data = this.datacollection.getAllRecords();
         resolve(this.data);
      });
   }


   /**
    * value
    * return the current value of this QL object.
    * this should either be the value of our .data element, or if not given,
    * then return the contents of our datacollection.
    * @return {multi} depending on the type of data we are representing.
    */
   value() {
      console.error("ABQL.value(): deprecated.");
   //    if (this.data && this.data.length) {
   //       return this.data;
   //    }
   //    this.data = this.datacollection.getAllRecords();
   //    return this.data;
   }
};
