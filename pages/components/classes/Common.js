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
   constructor(mainRoutes = [], menuRoutes = [], options = {}) {
      super({
         wildcard: options.wildcard ?? false,
      });
      this._dc = null;
      this._routes = {
         mainRoutes: (Array.isArray(mainRoutes) && mainRoutes) || [],
         menuRoutes: (Array.isArray(menuRoutes) && menuRoutes) || [],
      };
      this.page = null;
   }

   get routes() {
      return structuredClone(this._routes);
   }

   async init(page) {
      this.page = page;
   }

   get dc() {
      return this._dc;
   }

   set dc(value) {
      this._dc = value;
   }
}

export default Common;
