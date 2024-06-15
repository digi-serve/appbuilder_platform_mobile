/**
 * @class Landing
 */
"use strict";

import EventEmitter from "eventemitter2";

class Landing extends EventEmitter {
   constructor() {
      super({
         wildcard: true,
      });
      this.page = null;
      this.route = {
         path: "/",
         componentUrl: "./lib/platform/pages/components/landing.html",
      };
   }

   async init(page) {
      this.page = page;
   }
}

export default new Landing();
