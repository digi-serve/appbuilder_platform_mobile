// // Import our Custom Components here:
// import CustomComponentManager from '../webix_custom_components/customComponentManager'
var ABComponentCore = require("../core/ABComponentCore");

module.exports = class ABComponent extends ABComponentCore {
   /**
    * @param {object} App
    *      ?what is this?
    * @param {string} idBase
    *      Identifier for this component
    */
   constructor(App, idBase) {
      super(App, idBase);

      var L = this.Label;

      this.App.labels = {
         // add: L('ab.common.add', "*Add"),
         // create:   L('ab.common.create', "*Create"),
         // "delete": L('ab.common.delete', "*Delete"),
         // edit: 	  L('ab.common.edit', "*Edit"),
         // "export": L('ab.common.export', "*Export"),
         // formName: L('ab.common.form.name', "*Name"),
         // "import": L('ab.common.import', "*Import"),
         // rename:   L('ab.common.rename', "*Rename"),
         // ok: 	  L('ab.common.ok', "*Ok"),
         // cancel:   L('ab.common.cancel', "*Cancel"),
         // save: 	  L('ab.common.save', "*Save"),
         // yes: 	  L('ab.common.yes', "*Yes"),
         // no: 	  L('ab.common.no', "*No"),
         // none: 	  L('ab.common.none', "*None"),
         // invalidMessage: {
         // 	required: 	  L('ab.common.invalid_message.required', "*This field is required"),
         // },
         // createErrorMessage:   L('ab.common.create.error', "*System could not create <b>{0}</b>."),
         // createSuccessMessage: L('ab.common.create.success', "*<b>{0}</b> is created."),
         // updateErrorMessage:  L('ab.common.update.error', "*System could not update <b>{0}</b>."),
         // updateSucessMessage: L('ab.common.update.success', "*<b>{0}</b> is updated."),
         // deleteErrorMessage:   L('ab.common.delete.error', "*System could not delete <b>{0}</b>."),
         // deleteSuccessMessage: L('ab.common.delete.success', "*<b>{0}</b> is deleted."),
         // renameErrorMessage: L('ab.common.rename.error', "*System could not rename <b>{0}</b>."),
         // renameSuccessMessage: L('ab.common.rename.success', "*<b>{0}</b> is renamed."),
         // // Data Field  common Property labels:
         // dataFieldHeaderLabel: L('ab.dataField.common.headerLabel', '*Section Title'),
         // dataFieldHeaderLabelPlaceholder: L('ab.dataField.common.headerLabelPlaceholder', '*Section Name'),
         // dataFieldLabel: L('ab.dataField.common.fieldLabel', '*Label'),
         // dataFieldLabelPlaceholder: L('ab.dataField.common.fieldLabelPlaceholder', '*Label'),
         // dataFieldColumnName: L('ab.dataField.common.columnName', '*Field Name'),
         // dataFieldColumnNamePlaceholder: L('ab.dataField.common.columnNamePlaceholder', '*Database field name'),
         // dataFieldShowIcon: L('ab.dataField.common.showIcon', '*show icon?'),
         //          dataFieldRequired: L('ab.dataField.common.required', '*Required'),
         // componentDropZone: L('ab.common.componentDropZone', '*add widgets here')
      };

      // var componentManager = new CustomComponentManager();
      // componentManager.initComponents(App);
   }
};
