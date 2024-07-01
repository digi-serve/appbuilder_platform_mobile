/**
 * @class Welcome
 */
"use strict";

import Common from "./classes/Common";

class Welcome extends Common {
   /**
    */
   constructor() {
      super([
         {
            path: "/welcome/",
            componentUrl: "./lib/platform/pages/components/welcome.html",
         },
      ]);
      this._availableMem = null;
      this._brands = null;
      this._deviceMemory = null;
      this._userAgent = null;
   }

   async init(page) {
      await super.init(page);
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
