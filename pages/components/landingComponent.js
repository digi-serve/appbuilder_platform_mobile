/**
 * @class LandingComponent
 */
"use strict";

import EventEmitter from "eventemitter2";

class LandingComponent extends EventEmitter {
   constructor() {
      super({
         wildcard: true,
      });
      this.page = null;
      this.route = {
         path: "/",
         componentUrl: "./lib/platform/pages/components/landingComponent.html",
      };
   }

   async init(page) {
      this.page = page;
   }
}

export default new LandingComponent();
