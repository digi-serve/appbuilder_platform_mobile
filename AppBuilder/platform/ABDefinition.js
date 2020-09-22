// import ABApplication from "./ABApplication"

var ABDefinitionCore = require("../core/ABDefinitionCore");

var _AllDefinitions = {
   /* defID: {defJSON} */
};
// {obj} _AllDefinitions
// a hash of def.id => {ABDefinition} for quick lookups in our
// ABDefinition.definition() routine.

var DefinitionData = require("../../../ABDefinitions");
(DefinitionData.definitions || []).forEach((def) => {
   _AllDefinitions[def.id] = def;
});

module.exports = class ABDefinition extends ABDefinitionCore {
   ///
   /// Static Methods
   ///
   /// Available to the Class level object.  These methods are not dependent
   /// on the instance values of the Application.
   ///

   /**
    * @method loadAll()
    *
    * load all the Definitions for The current AppBuilder:
    *
    * @return {array}
    */
   static loadAll(allDefs = []) {
      // this shouldn't be called ...
      allDefs.forEach((def) => {
         _AllDefinitions[def.id] = def;
      });
   }

   /**
    * @method definition()
    *
    * return the current Definition data for the requested object id.
    *
    * Note: this returns the actual ABDefinition.json data that our System
    * objects can use to create a new instance of itself.  Not the ABDefinition
    * itself.
    *
    * @param {string} id  the id of the definition to update
    * @return {obj}   the updated value of the ABDefinition entry from the server.
    */
   static definition(id) {
      var def = _AllDefinitions[id];
      if (def && def.json) {
         return def.json;
      }
      return null;
   }

   /**
    * @method definitions()
    *
    * return the definitions that match the provided filter fn.
    *
    * Note: this returns the actual ABDefinition.json data that our System
    * objects can use to create a new instance of itself.  Not the ABDefinition
    * itself.
    *
    * @param {string} id  the id of the definition to update
    * @return {obj}   the updated value of the ABDefinition entry from the server.
    */
   static definitions(fn = () => true) {
      return Object.keys(_AllDefinitions)
         .map((k) => _AllDefinitions[k])
         .filter(fn)
         .map((d) => {
            return d.json;
         });
   }

   static allApplications(fn = () => true) {
      return ABDefinition.definitions((d) => d.type == "application").filter(
         fn
      );
   }

   static allDatacollections(fn = () => true) {
      return ABDefinition.definitions((d) => d.type == "datacollection").filter(
         fn
      );
   }

   static allObjects(fn = () => true) {
      return ABDefinition.definitions((d) => d.type == "object").filter(fn);
   }

   static allQueries(fn = () => true) {
      return ABDefinition.definitions((d) => d.type == "query").filter(fn);
   }
};
