/**
 * @class PasswordPage
 *
 */
"use strict";

import CryptoJS from "crypto-js";
import Common from "./classes/Common.js";

class PasswordPage extends Common {
   /**
    */
   constructor() {
      super(
         "password-page",
         "lib/platform/pages/passwordPage.html",
         "lib/platform/pages/passwordPage.css",
      );
      this._pbkdf2Configs = {
         keySize: 256 / 32,
         iterations: 10000,
         iterationMode: "semi",
         semiCount: 2000,
      };
   }

   async _hash(text = "") {
      const app = this.app;
      return (
         await app.utils.pbkdf2(
            CryptoJS.SHA256(text).toString(),
            (await app.resources.storage.get("user", "salt")) || "",
            this._pbkdf2Configs,
         )
      ).toString();
   }

   /**
    * Test whether the secret given through `_setPassword()` is valid.
    */
   async _testCrypto(password = "") {
      return (
         password.length >= 8 &&
         (await this._hash(password)) ===
            (await this.app.resources.storage.get("user", "passwordHash"))
      );
   }

   async init(app) {
      await super.init(app);
      const $setup = this.$("div.setup");
      const $setup_p1 = $setup.find('input[name="p1"]');
      const $setup_p2 = $setup.find('input[name="p2"]');
      const $unlock = this.$("div.unlock");
      const $unlock_p1 = $unlock.find('input[name="p1"]');
      //get buildTimestamp from resources
      const buildTimestamp = await app.buildTimeStamp;
      this.$("div.timeStamp").html(
         `<div class="card-header bg-color-gray text-color-white">${buildTimestamp}</div>`,
      );

      /**
       * This animation plays after the password has been confirmed. The password
       * page splits open to reveal the app page underneath.
       */
      const _splitAnimation = () => {
         return new Promise((resolve /*, reject */) => {
            // trigger CSS animation
            this.$element.removeClass("open-sesame").addClass("open-sesame");
            setTimeout(() => {
               this.$element.removeClass("open-sesame");
               resolve();
            }, 700);
         });
      };

      /**
       * This animation plays while the storage system forces a password check
       * delay.
       */
      const _scanAnimation = () => {
         const $scanner = $unlock.find(".scanner");
         // workaround for iOS display bug?
         $scanner.show();

         // scanner has position absolute, so it doesn't center naturally
         // like the password box.
         $scanner.width($scanner.siblings("input").eq(0).outerWidth());
         $scanner.css(
            "left",
            parseInt($unlock.find("input").css("margin-left")) - 15,
         );

         // trigger CSS animation
         $scanner.removeClass("animated").addClass("animated");
      };
      const _scanAnimationStop = () => {
         const $scanner = $unlock.find(".scanner");
         $scanner.removeClass("animated");
         $scanner.hide();
      };

      // Reveal the SETUP screen for first time use.
      const resources = this.app.resources;
      const storage = resources.storage;
      const passwordHash = await storage.get("user", "passwordHash");
      if (passwordHash != null) {
         /**
          * @function unlockFunction
          * arrow function to keep the context of "this"
          * param {void}
          */
         const unlockFunction = async ($button) => {
            $unlock_p1.blur();
            const $warningWrongPass = $unlock.find(".warning-wrong-pass");
            $warningWrongPass.hide();
            _scanAnimation();
            try {
               if (!(await this._testCrypto($unlock_p1.val())))
                  throw new Error("Wrong password!");
               _scanAnimationStop();
               this.emit("passwordReady");
               await _splitAnimation();
               this.emit("passwordDone");
               storage.config = { encrypt: true, key: passwordHash };
               $button.prop("disabled", false);
            } catch (err) {
               _scanAnimationStop();
               $warningWrongPass.show();

               // Trigger wrong-password CSS animation
               $unlock_p1.removeClass("wrong").addClass("wrong");
               setTimeout(() => {
                  $button.prop("disabled", false);
                  $unlock_p1.removeClass("wrong");
               }, 1000);
            }
         };

         // RESET DATA button on Unlock screen
         // Needed in case user forgets password and wants to start over
         $unlock.find(".reset-data button").on("click", () => {
            $.confirm(
               "<t>You will lose all data and reset to a blank app</t>",
               "<t>Are you sure?</t>",
               async () => {
                  await Promise.all(
                     this.app.resources.storage.validStorageKeys.map(
                        (availableStorageKey) =>
                           storage.clearAll(availableStorageKey),
                     ),
                  );
                  location.reload();
               },
            );
         });

         // RELOAD DATA button on Unlock screen
         // Needed in case user wants to reload
         $unlock.find(".refreshAppButton button").on("click", () => {
            location.reload();
         });

         // "Go" button or ENTER key submits the form
         $unlock.find("form").on("submit", (ev) => {
            const $go = this.$(".go button");

            $go.prop("disabled", true);
            ev.preventDefault();
            //
            unlockFunction($go);
         });

         // "Refresh" button on Unlock screen
         $unlock.find(".refresh button").on("click", () => {
            const $button = $unlock.find(".refresh button");
            $button.prop("disabled", true);
            this.$(".go button").prop("disabled", true);

            console.log(this.app.resources.storage.availableTableKeys);
            // this.emit("refreshAppLogin");
            // // now, what are we supposed to trigger in order to get our reset started?
            // unlockFunction($button);
         });
         $unlock.show();
         return;
      }

      // Detects if device is on iOS
      const userAgent = navigator.userAgent.toLowerCase();

      // install instructions
      const $iOSInstruct = this.$("div.ios-instruct");
      // Detects if device is in standalone mode
      try {
         if (
            /iphone|ipad|ipod/.test(userAgent) &&
            navigator?.standalone === false
         )
            $iOSInstruct.show();
         else {
            $setup.show();
         }
      } catch (error) {
         console.error(
            "Error detecting iOS standalone mode on passwordPage:",
            error,
         );
         $setup.show();
      }

      const $form = $setup.find("form");
      const _checkUIPasswordSetup = () => {
         const p1 = $setup_p1.val() ?? "";
         const p2 = $setup_p2.val() ?? "";
         const $allClear = $setup.find(".all-clear");
         $allClear.hide();

         // Password must be at least 8 chars long
         const $warningTooShort = $setup.find(".warning-too-short");
         if (p1.length < 8) {
            $warningTooShort.show();
            return false;
         }
         $warningTooShort.hide();

         // Passwords must match
         const $warningNoMatch = $setup.find(".warning-no-match");
         if (p1 !== p2) {
            $warningNoMatch.show();
            return false;
         }
         $warningNoMatch.hide();
         $allClear.show();
         return true;
      };

      // On Setup screen, handle TAB/ENTER key, or Android/iOS equivalent
      $setup_p1.on("keyup", (ev) => {
         _checkUIPasswordSetup();
         switch (ev.keyCode) {
            case 9:
            case 13:
               break;
            default:
               return;
         }
         ev.preventDefault();
         $setup_p2.focus();
      });

      // On Setup screen, handle TAB/ENTER key, or Android/iOS equivalent
      $setup_p2.on("keyup", (ev) => {
         _checkUIPasswordSetup();
         switch (ev.keyCode) {
            case 13:
               break;
            default:
               return;
         }
         ev.preventDefault();
         $form.emit("submit");
      });

      // "Use this passphrase" button or ENTER key submits the form
      $form.on("submit", async (ev) => {
         ev.preventDefault();
         $setup_p1.blur();
         $setup_p2.blur();
         _scanAnimation();
         let salt = await storage.get("user", "salt");
         if (salt == null) {
            salt = CryptoJS.lib.WordArray.random(16).toString();
            await storage.set("user", "salt", salt);
         }
         const hash = await this._hash($setup_p1.val());
         await storage.set("user", "passwordHash", hash);
         storage.config = { encrypt: true, key: hash };
         _scanAnimationStop();
         _splitAnimation();
         ev.preventDefault();
         this.emit("passwordReady");
         this.emit("passwordDone");

      });
   }
}

export default new PasswordPage();
