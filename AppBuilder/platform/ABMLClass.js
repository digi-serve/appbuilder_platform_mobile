/**
 * ABMLClass
 * manage the multilingual information of an instance of a AB Defined Class.
 *
 * these classes have certain fields ("label", "description"), that can be
 * represented in different language options as defined by our platform.
 *
 * This platform ABMLClass will define 2 methods that allow for the translation
 * untranslation of this data.
 */
// var ABDefinition = require("./ABDefinition");
const ABMLClassCore = require("../core/ABMLClassCore");

const { translate } = require("../../resources/Translate");

module.exports = class ABMLClass extends ABMLClassCore {
   /**
    * @method translate()
    *
    * translate the multilingual fields (in this.mlFields) from
    * our .translation data.
    */
   /*
    translate(instance, attributes, fields) {
        if (!instance) instance = this;
        if (!attributes) attributes = this;
        if (!fields) fields = this.mlFields;

        super.translate(instance, attributes, fields);
    }
    */

   /**
    * @method unTranslate()
    *
    * un-translate the multilingual fields (in this.mlFields) into
    * our .translation data
    */
   /*
    unTranslate(instance, attributes, fields) {
        if (!instance) instance = this;
        if (!attributes) attributes = this;
        if (!fields) fields = this.mlFields;
        
        super.unTranslate(instance, attributes, fields);
    }
    */

   /**
    * @method languageDefault
    * return a default language code.
    * @return {string}
    */
   languageDefault() {
      return translate.langCode || "en";
   }
};
