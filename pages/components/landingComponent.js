/**
 * @class LandingComponent
 *
 * Manages the data processing for the Settings component.
 * This is a component of the AppPage.
 */
"use strict";

import EventEmitter from "eventemitter2";

class LandingComponent extends EventEmitter {
   constructor() {
      super({
         wildcard: true,
      });
      this.id = "landing-component";
      this.route = {
         path: "/",
         componentUrl:
            "./lib/platform/pages/components/landingComponent.html",
      };
      this.appPage = null;
   }

   async init (appPage) {
      this.appPage = appPage;
   }
}

export default new LandingComponent();
