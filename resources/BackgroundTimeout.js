/**
 * Reload the app if it goes into the background for too long.
 */
"use strict";

import moment from "moment";

var pauseTime;

export default function BackgroundTimeout(minutesToWait = 9) {
   // Listen for when the app goes into the background and store a timestamp
   document.addEventListener(
      "pause",
      () => {
         pauseTime = moment();
         console.log("Paused: ", pauseTime);
      },
      false
   );

   // Listen for when the app goes into the background and store a timestamp
   document.addEventListener(
      "resume",
      () => {
         setTimeout(function() {
            var now = moment();
            console.log("Resume: ", now);
            if (moment.isMoment(pauseTime)) {
               var minPassed = now.diff(pauseTime, "minutes");
               console.log("Time Lapse:", minPassed, " minutes");
               if (minPassed > minutesToWait) {
                  var node = document.createElement("DIV");
                  node.id = "lockFade";
                  node.classList.add("lockFade");
                  document.getElementsByTagName("BODY")[0].appendChild(node);
                  setTimeout(function() {
                     document
                        .getElementById("lockFade")
                        .classList.add("lockFadeIn");
                     setTimeout(function() {
                        // TODO temporary logging of all site reloads
                        console.error("Reloading app due to inactivity: BackgroundTimeout.js");
                        window.location.reload();
                     }, 600);
                  }, 50);
               }
            }
         }, 0);
      },
      false
   );
}
