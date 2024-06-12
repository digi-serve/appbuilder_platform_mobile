/**
 * @class SettingsComponent
 */
"use strict";

import EventEmitter from "eventemitter2";

class SettingsComponent extends EventEmitter {
   constructor() {
      super({
         wildcard: true,
      });
      this.page = null;
      this.route = {
         path: "/settings/",
         componentUrl: "./lib/platform/pages/components/settingsComponent.html",
      };
      this.templates = {};
      this.appInfo = null;
      this.isUpdateReady = false;
   }

   /**
    * Shortcut for this.$element.find()
    */
   $(pattern) {
      var $element;
      if (this.id) {
         $element = $("#" + this.id);
      } else {
         $element = $(document.body);
      }
      return $element.find(pattern);
   }

   /**
    * @param {ABFactory} AB
    */
   async init(page) {
      this.page = page;
      await this.prepareTemplates({
         updateInfo:
            "lib/platform/pages/components/settingsComponent-update-info.html",
      });
   }

   /**
    * Compiles all the given Template7 templates, then
    * resolves `this.templatesReady`.
    *
    * @param {object} templates
    *      {
    *          <name>: <template path>,
    *          ...
    *      }
    * @return {Deferred}
    */
   async prepareTemplates(templates = {}) {
      const DFDs = [];
      for (const name in templates) {
         const path = templates[name];
         ((path, name) => {
            DFDs.push(
               $.ajax({
                  url: path,
                  success: (data /* , status, xhr */) => {
                     this.templates[name] = Template7.compile(data);
                  },
               })
            );
         })(path, name);
      }
      // await Promise.all(DFDs);
      return $.when(...DFDs);
   }

   /**
    * Render the App Info card
    * See settingsComponent-update-info.html
    */
   renderPackageInfo() {
      if (this.appInfo) {
         this.$("#update-info-content").remove();
         this.$("#update-info .card-content").prepend(
            this.templates.updateInfo(this.appInfo)
         );
      }
   }

   deleteLocalImages() {
      return new Promise((resolve, reject) => {
         this.page.app.resources.camera.deleteLocalImages().then((data) => {
            this.page.app.resources.camera.imageLookUp().then((data) => {
               resolve(data);
            });
         });
      });
   }
}

export default new SettingsComponent();
