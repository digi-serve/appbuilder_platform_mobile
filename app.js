// App.js
"use strict";

import EventEmitter from "eventemitter2";

// ABFactory
import ABFactory from "./AppBuilder/ABFactory.js";

// Pages
import appPage from "./pages/appPage.js";
import loadingPage from "./pages/loadingPage.js";
import passwordPage from "./pages/passwordPage.js";

// Resources
import account from "./resources/Account.js";
import analytics from "./resources/Analytics.js";
import busy from "./resources/Busy.js";
import camera from "./resources/Camera.js";
import network from "./resources/Network.js";
import storage from "./resources/Storage.js";
import translate from "./resources/Translate.js";

// Utils
import JSEncrypt from "jsencrypt";
import jsQR from "jsqr";
import { v4 as uuidv4 } from "uuid";
import Lock from "./utils/Lock.js";
import pbkdf2 from "./utils/pbkdf2.js";

class App extends EventEmitter {
   constructor() {
      super();
      this._AB = null;
      this._abApps = [];
      this._abDatacollections = [];
      this._abObjects = [];
      this._abQuerys = [];
      this.pages = {
         appPage,
         loadingPage,
         passwordPage,
      };
      this.resources = {
         account,
         analytics,
         busy,
         camera,
         network,
         storage,
         translate,
      };
      this.utils = {
         JSEncrypt,
         Lock,
         jsQR,
         pbkdf2,
         uuidv4,
         languageDefault: this.languageDefault,
      };
   }

   async init(appbuilderDefinitions, applications) {
      const AB = (this._AB = new ABFactory(appbuilderDefinitions));
      this._applications = applications;
      await AB.init(this);
      this._abApps = AB.applications();
      this._abDCs = AB.datacollections();
      this._abObjs = AB.objects();
      this._abQrys = AB.queries();
      const resources = this.resources;
      let pendingPromises = [];
      for (const key in resources)
         pendingPromises.push(resources[key].init(this));
      await Promise.all(pendingPromises);
      pendingPromises = [];
      const pages = this.pages;
      for (const key in pages) pendingPromises.push(pages[key].init(this));
      await Promise.all(pendingPromises);

      // Force garbade collector.
      pendingPromises = null;
      const appPage = pages.appPage;
      const passwordPage = pages.passwordPage;
      const loadingPage = pages.loadingPage;
      passwordPage.on("loading", () => {
         loadingPage.overlay();
      });
      passwordPage.on("loadingDone", () => {
         loadingPage.hide();
      });
      passwordPage.on("passwordReady", () => {
         // After password is ready, make the main app visible.
         // If there are transparent UI elements on the password page, the main
         // app page will show through under that.
         appPage.$element.show();
      });
      passwordPage.on("passwordDone", () => {
         // Fully show the main app page, and hide the password page.
         appPage.emit("ready");
         appPage.show();
      });

      // refresh the service workers, local storage, and other resources
      passwordPage.on("refreshAppLogin", () => {
         // display a loading ui
         passwordPage.emit("loading");
         appPage.reset(true);
      });
   }

   getABDCByKey(key) {
      return this._abDCs.find(
         (dc) => dc.id === key || dc.name === key || dc.label == key
      );
   }

   languageDefault() {
      return this.resources.translate.langCode || "en";
   }

   show(pageKey) {
      const pages = this.pages;
      const passwordPage = pages.passwordPage;
      switch (pageKey) {
         case "appPage":
            // making sure other objects respond to any password signals:
            // simulate the password process:
            passwordPage.emit("loading");
            passwordPage.emit("loadingDone");
            passwordPage.emit("passwordReady");
            passwordPage.emit("passwordDone");
            break;
         default:
            break;
      }
      pages[pageKey] != null && pages[pageKey].show();
   }

   get abDCs() {
      return this._abDCs;
   }

   get abObjs() {
      return this._abObjs;
   }

   get applications() {
      return this._applications;
   }

   get buildTimeStamp() {
      return new Date(BUILD_TIMESTAMP).toLocaleDateString("en-US", {
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
         hour: "2-digit",
         minute: "2-digit",
      });
   }
}

export default new App();
