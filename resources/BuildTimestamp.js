/**
 * @class BuildTimestamp
 */
"use strict";

let Build_Timestamp;
try {
   Build_Timestamp = BUILD_TIMESTAMP;
   /* global VERSION */
   /* Version from package.json. Set by the DefinePlugin in webpack. */
} catch (err) {
   console.warn("Build_Timestamp variable not found");
}

class Build_TimestampFinder {
   constructor() {
      this.Build_Timestamp = Build_Timestamp;
      console.assert(Build_Timestamp, "Build_Timestamp not found")
      // Uncomment to disable updater
      //return;
   }

   /**
    * @return {Promise}
    */
   getBuild_Timestamp() {
      // 2024-02-29T12:00:43+07:00
      // convert to 2024/02/29 12:00
      let options = {
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
         hour: "2-digit",
         minute: "2-digit",
      };
      let displayDate = new Date(Build_Timestamp).toLocaleDateString("en-US", options);
      return displayDate
   }

}

var BuildTimestamp = new Build_TimestampFinder();
export default BuildTimestamp;
