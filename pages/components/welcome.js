/**
 * @class Welcome
 */
"use strict";
import EventEmitter from "eventemitter2";

class Welcome extends EventEmitter {
   /**
    */
   constructor() {
      super();
      this._availableMem = null;
      this._brands = null;
      this._deviceMemory = null;
      this._userAgent = null;
      this.page = null;
      this.route = {
         path: "/welcome/",
         componentUrl: "./lib/platform/pages/components/welcome.html",
      };
   }

   async init(page) {
      this.page = page;
      this._availableMem = navigator.userAgentData?.platform || "NA";
      this._brands = navigator.userAgentData?.brands || []; // array of objects
      this._deviceMemory = navigator.deviceMemory;
      this._userAgent = navigator.userAgent.toLowerCase();
   }

   getSystemInfo() {
      let brandListString = "";
      this._brands.forEach((brand) => {
         brandListString = `${brandListString}Brand: ${brand.brand} \n Version: ${brand.version} \n FullVersion: ${brand.fullVersion} \n Platform: ${brand.platform} \n \n`;
      });
      return `User Agent: ${this._userAgent} \n Available Memory: ${this._availableMem} \n Device Memory: ${this._deviceMemory} \n systemDumpInfo: ${brandListString}`;
   }
}

export default new Welcome();
