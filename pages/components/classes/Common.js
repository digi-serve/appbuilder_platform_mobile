/**
 * @class Common
 *
 * Base class for component controllers in the mobile framework.
 *
 **/
"use strict";

import EventEmitter from "eventemitter2";

class Common extends EventEmitter {
   /**
    */
   constructor(mainRoutes, menuRoutes, options) {
      super(options);
      this.page = null;
      this._routes = {
         mainRoutes: (Array.isArray(mainRoutes) && mainRoutes) || [],
         menuRoutes: (Array.isArray(menuRoutes) && menuRoutes) || [],
      };
   }

   get routes() {
      return structuredClone(this._routes);
   }

   async init(page) {
      this.page = page;
   }
}

export default Common;
