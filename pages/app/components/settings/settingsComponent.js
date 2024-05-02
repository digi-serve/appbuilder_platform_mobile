/**
 * @class SettingsComponent
 *
 * Manages the data processing for the Settings component.
 * This is a component of the AppPage.
 */
"use strict";

import EventEmitter from "eventemitter2";
import { translate } from "../../../../resources/Translate.js";
import updater from "../../../../resources/Updater.js";

class SettingsComponent extends EventEmitter {
   constructor() {
      super({
         wildcard: true,
      });
      this.id = "settings-page";
      this.appPage = null;
      this.templates = {};
      translate.on("recenterTitle", () => {
         if ($(".navbar").length) {
            this.appPage.f7App.navbar.size(".navbar");
         }
      });
      this.isUpdateReady = false;
      this.appInfo = null;
      this.pfsBackupDate = null;
      updater.on("installed", () => {
         this.isUpdateReady = true;
      });
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
    * @param {Framework7} f7App
    */
   async init(appPage) {
      this.appPage = appPage;
      await this.prepareTemplates({
         updateInfo:
            "lib/platform/pages/app/components/settings/settingsComponent-update-info.html",
      });

      // Initialize data.
      await Promise.all([
         this.loadData("pfsBackupDate", null),

         // CodePush app info
         this.loadData("appInfo", null),
      ]);
      this.appPage.f7App.getSize();

      // CodePush events
      updater.on("downloadStart", () => {
         this.$(".settings-update-card").hide();
         this.$("#update-progress").show();
         this.appPage.f7App.progressbar.set("#update-progress .progressbar", 0);
      });
      updater.on("downloading", (percentage) => {
         this.$(".settings-update").hide();
         this.$("#update-progress").show();
         this.appPage.f7App.progressbar.set(
            "#update-progress .progressbar",
            percentage
         );
      });
      updater.on("installing", () => {
         this.$(".settings-update-card").hide();
         this.$("#update-installing").show();
      });
      updater.on("installed", () => {
         this.$(".settings-update-card").hide();
         this.$("#update-ready").show();
      });
      updater.on("info", (info) => {
         this.saveData("appInfo", info);
         this.appInfo = info;
         this.renderPackageInfo();
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
    * Retrieve a value from persistent storage.
    *
    * @param {String} key
    * @param {anything} [defaultValue]
    *      Optional value to use if there was no stored value.
    * @param {function} [callback]
    *      Instead of `defaultValue` parameter, this callback function can be
    *      used to handle the stored value. `this[key]` will not be modified
    *      in this case.
    *
    * @return {Promise}
    */
   loadData(key, defaultValue = null) {
      return this.appPage.AB.storage
         .get(key)
         .then((value) => {
            if (typeof defaultValue == "function") {
               var callback = defaultValue;
               callback(value);
            } else {
               this[key] = value || defaultValue;
            }

            return value;
         })
         .catch((err) => {
            console.error(err);
            this.appPage.AB.analytics.logError(err);
         });
   }

   /**
    * Save a value to persistent storage.
    *
    * @param {String} key
    * @param {anything} [value]
    *      By default, the value is read from this[key].
    * @return {Promise}
    */
   saveData(key, value) {
      if (typeof value == undefined) {
         value = this[key];
         if (typeof value == "object" && typeof value.serialize == "function") {
            value = value.serialize();
         }
      }
      return this.appPage.AB.storage.set(key, value);
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

   /**
    * Get stored documents size
    */
   getStorageSize() {
      return new Promise((resolve, reject) => {
         this.appPage.AB.camera.imageLookUp().then((data) => {
            resolve(data);
         });
      });
   }

   deleteLocalImages() {
      return new Promise((resolve, reject) => {
         this.appPage.AB.camera.deleteLocalImages().then((data) => {
            this.appPage.AB.camera.imageLookUp().then((data) => {
               resolve(data);
            });
         });
      });
   }
}

export default new SettingsComponent();
