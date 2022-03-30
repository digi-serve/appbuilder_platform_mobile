/**
 * @class Storage
 *
 * Manages persistent storage, via a key-value interface.
 *
 */
"use strict";

import analytics from "./Analytics.js";
import EventEmitter from "eventemitter2";
import CryptoJS from "crypto-js";
import Lock from "./Lock.js";
import Log from "./Log.js";
import PBKDF2async from "./PBKDF2-async.js";

var config = require("../../config/config.js");

const disableEncryption = !config.platform.encryptedStorage; // false;
const storeName = "key_value_data";

class Storage extends EventEmitter {
   constructor(name = "sdc", label = "SDC", version = "1.0", sizeInMB = 2) {
      super();
      this.secret = null; // passphrase
      this.key = null; // 256-bit key
      this.salt = null;

      this._queueLocks = {
         // a constant reference to available Synchronization Locks.
         /* key : Lock() */
      };

      // IndexedDB is standard on modern browsers
      try {
         var request = indexedDB.open(name);
         request.onerror = (event) => {
            Log("IndexedDB failure on init", request.error);
            analytics.logError(request.error);
         }
         request.onsuccess = (event) => {
            this.db = request.result;
            this.db.onerror = (event) => {
               Log("IndexedDB error", event.target.errorCode);
            }
            // Test if the `key_value_data` object store is present
            var transaction = this.db.transaction(storeName, "readonly");
            transaction.onerror = (event) => {
               console.log('IndexedDB store not found?', transaction.error);
               // Store was not found. Try to create it now.
               if (transaction.error.name == "NotFoundError") {
                  this.db.createObjectStore(storeName);
               }
            }

         }
         // On first time, set up the obect store
         request.onupgradeneeded = (event) => {
            var db = event.target.result;
            var objectStore = db.createObjectStore(storeName);
         }
      } 
      // IndexedDB not supported on this device?
      catch (err) {
         Log(err);
         alert(
            "Error initializing the storage system:\n" +
               (err.message || "") +
               "\n" +
               (err.stack || "")
         );
         analytics.logError(err);
      }
   }

   wait(time = 650) {
      return new Promise((ok) => {
         setTimeout(ok, time);
      });
   }

   /** 
    * Set the password that will be used to encrypt/decrypt data.
    * 
    * The password is passed through a key derivation function (PBKDF2)
    * to generate the actual crypto key.
    *
    * @param {string} secret
    *   Password
    * @param {boolean} [resetSalt]
    *   A salt is automatically generated the first time a password is set.
    *   You may optionally choose to force reset to a new salt. This will
    *   premanently lose the old password and all data that was stored.
    * @return {Promise}
    */
   setPassword(secret, resetSalt = false) {
      return new Promise((resolve, reject) => {
         var startTime = Date.now();
         this.secret = secret;

         Promise.resolve()
            .then(() => {
               if (resetSalt) {
                  return null;
               } else {
                  return this.get("__sdc_salt", {
                     resetAppOnFailure: false,
                     deserialize: false
                  });
               }
            })
            .then((salt) => {
               if (!salt) {
                  // Generate new salt
                  // (any old encrypted data will be lost)
                  this.salt = CryptoJS.lib.WordArray.random(16);
                  // Save the new salt
                  return this.set("__sdc_salt", this.salt.toString(), {
                     serialize: false,
                     forcePlainText: true
                  });
               } else {
                  // Use existing salt
                  this.salt = CryptoJS.enc.Hex.parse(salt);
                  return null;
               }
            })
            .then(() => {
               // Allow any animations to start before beginning KDF
               return this.wait(10);
            })
            .then(() => {
               // Sync (may lock up UI)
               //var fn = CryptoJS.PBKDF2;

               // Async (crashes debugger)
               var fn = PBKDF2async;

               return fn(this.secret, this.salt, {
                  keySize: 256 / 32,
                  iterations: 10000,
                  iterationMode: "semi",
                  semiCount: 2000
               });
            })
            .then((key) => {
               this.key = key;

               // If the KDF was too fast, wait some more
               var endTime = Date.now();
               var diff = endTime - startTime;
               if (diff > 650) {
                  return null;
               } else {
                  return this.wait(diff);
               }
            })
            .then(() => {
               resolve();
            })
            .catch((err) => {
               Log("Password error", err);
               analytics.logError(err);
               reject(err);
            });
      });
   }

   /**
    * Encrypt a string with AES, using the key from `setPassword()`.
    *
    * @param {string} plaintext
    * @return {string}
    *      Ciphertext with embedded IV.
    */
   encrypt(plaintext) {
      // var startTime = new Date().getTime();
      var iv = CryptoJS.lib.WordArray.random(16);
      var ciphertext = CryptoJS.AES.encrypt(plaintext, this.key, { iv: iv });
      // var diff = new Date().getTime() - startTime;
      // if (diff > 999) {
      //    console.warn("-----> Storage stop encrypting ", diff);
      //    console.log("Big data", plaintext);
      // } else {
      //    console.log("-----> Storage stop encrypting ", diff);
      // }
      return ciphertext.toString() + ":::" + iv.toString();
   }

   /**
    * Decrypt a string with AES, using the key from `setPassword()`.
    *
    * @param {string} encoded
    *      An encoded string produced by `encrypt()`.
    * @return {string}
    */
   decrypt(encoded) {
      // var startTime = new Date().getTime();
      var parts = encoded.split(":::");
      var ciphertext = parts[0];
      var iv = CryptoJS.enc.Hex.parse(parts[1]);
      var decrypted = CryptoJS.AES.decrypt(ciphertext, this.key, {
         iv: iv
      }).toString(CryptoJS.enc.Utf8);
      // var diff = new Date().getTime() - startTime;
      // if (diff > 999) {
      //    console.warn("-----> Storage stop decrypting ", diff);
      //    console.log("Big Data", decrypted);
      // } else {
      //    console.log("-----> Storage stop decrypting ", diff);
      // }
      return decrypted;
   }

   /**
    * Test whether the secret given through `setPassword()` is valid.
    */
   testCrypto() {
      analytics.event("testing password");

      return new Promise((resolve, reject) => {
         if (!this.secret) reject();
         else {
            this.get("__sdc_password", {
               resetAppOnFailure: false,
               deserialize: false
            })
               .then((value) => {
                  // Compare against previously set password
                  var hash = CryptoJS.SHA256(this.secret).toString();
                  if (value === null) {
                     // No previous password. Save hash now.
                     this.set("__sdc_password", hash, {
                        serialize: false
                     });
                     this.emit("ready");
                     resolve();
                  } else if (value == hash) {
                     this.emit("ready");
                     resolve();
                  } else {
                     reject();
                  }
               })
               .catch((err) => {
                  reject(err);
               });
         }
      });
   }

   /**
    * Save something to persistent storage.
    *
    * @param {string} key
    *      Name of thing to save.
    * @param {string/object} value
    *      Value of thing to save.
    * @param {object} [options]
    * @param {boolean} [options.forcePlainText]
    *      Bypass encryption and save as plain text?
    *      Default false.
    * @param {boolean} [options.serialize]
    *      Serialize `value` with JSON.stringify().
    *      Default true.
    * @return {Promise}
    */
   set(key, value, options = {}) {
      var defaults = {
         forcePlainText: false,
         serialize: true
      };
      if (disableEncryption) {
         defaults.forcePlainText = true;
      }
      options = $.extend({}, defaults, options);

      var isEncrypted = 0;
      // Serialize
      if (options.serialize) {
         try {
            value = JSON.stringify(value);
         } catch (exception) {
            var cleanObj = (obj, level = 1) => {
               if (!obj) return;
               Object.keys(obj).forEach((k) => {
                  if (k.indexOf("__relation") > -1) {
                     if (level == 1) {
                        if (Array.isArray(obj[k])) {
                           obj[k].forEach((o) => {
                              cleanObj(o, level + 1);
                           });
                        } else {
                           cleanObj(obj[k], level + 1);
                        }
                     } else {
                        delete obj[k];
                     }
                  }
               });
            };
            Object.keys(value).forEach((k) => {
               cleanObj(value[k]);
            });
            value = JSON.stringify(value);
         }
      }

      // Encrypt
      if (!options.forcePlainText && this.secret) {
         value = this.encrypt(value);
         isEncrypted = 1;
      }

      return new Promise((resolve, reject) => {
         var transaction = this.db.transaction(storeName, "readwrite");
         transaction.oncomplete = (event) => {
            resolve();
         }
         transaction.onerror = (event) => {
            Log("DB error during set", transaction.error)
            reject(transaction.error);
         }

         var store = transaction.objectStore(storeName);
         var req = store.put({
            value: value,
            isEncrypted: isEncrypted
         }, key);
      });
   }

   /**
    * Load something from persistent storage.
    *
    * @param {string} key
    *      Name of thing to load.
    * @param {object} [options]
    * @param {boolean} [resetAppOnFailure]
    *      Reload the app on failure to decrypt?
    *      Default true.
    * @param {boolean} [deserialize]
    *      Deserialize loaded value with JSON.parse().
    *      Default true.
    * @return {Promise}
    */
   get(key, options = {}) {
      if (!this.db) {
         console.warn("DB not available yet. retrying...");
         return this.wait(50)
            .then(() => {
               return this.get(key, options);
            });
      }

      var defaults = {
         resetAppOnFailure: true,
         deserialize: true
      };
      if (disableEncryption) {
         defaults.resetAppOnFailure = false;
      }
      options = $.extend({}, defaults, options);

      return new Promise((resolve, reject) => {
         var transaction = this.db.transaction(storeName, "readonly");
         transaction.onerror = (event) => {
            Log("DB error during get", transaction.error)
            reject(transaction.error);
         }

         var store = transaction.objectStore(storeName);
         var req = store.get(key);
         req.onsuccess = (event) => {
            var row = req.result;
            var value, isEncrypted;
            // Parse results
            if (row) {
               value = row.value;
               isEncrypted = row.isEncrypted;
            }
            // No results found for this key
            else {
               value = null;
               isEncrypted = false;
            }

            // Decrypt
            if (isEncrypted && this.secret) {
               try {
                  value = this.decrypt(value);
               } catch (err) {
                  // Unable to decrypt
                  if (options.resetAppOnFailure) {
                     document.location.reload();
                  } else {
                     Log("Incorrect password");
                     reject(new Error("Incorrect password"));
                  }
                  return;
               }
            } 
            // No password was given
            else if (isEncrypted) {
               if (options.resetAppOnFailure) {
                  document.location.reload();
               } else {
                  Log("Missing password");
                  reject(new Error("Missing password"));
               }
               return;
            }

            // Deserialize
            if (options.deserialize) {
               try {
                  value = JSON.parse(value);
               } catch (err) {
                  Log("Bad saved data?", key, value);
                  value = null;
               }
            }

            resolve(value);            
         }

      });
   }


   /** 
    * Delete the specified record from storage.
    * 
    * @param {string} key
    * @return {Promise}
    */
   clear(key) {
      return new Promise((resolve, reject) => {
         var transaction = this.db.transaction(storeName, "readwrite");
         transaction.onerror = (event) => {
            Log("DB error during clear", event.error);
            analytics.logError(event.error);
            reject(event.error);
         }
         var store = transaction.objectStore(storeName);
         var req = store.delete(key);
         req.onsuccess = (event) => {
            resolve();
         }
      });
   }


   /**
    * Delete all records from storage.
    *
    * @return {Promise}
    */
   clearAll(keyRange) {
      return new Promise((resolve, reject) => {
         var transaction = this.db.transaction(storeName, "readwrite");
         transaction.onerror = (event) => {
            Log("DB error during clearAll", event.error);
            analytics.logError(event.error);
            reject(event.error);
         }
         var store = transaction.objectStore(storeName);
         if (keyRange) {
            var req = store.delete(keyRange);
         } else {
            var req = store.clear();
         }
         req.onsuccess = (event) => {
            resolve();
         }
      });
   }

   /**
    * Lock
    * expose an Async Lock for a given Key.  This is designed to
    * help ModelLocal objects synchronize data access.
    * @param {string} key  a unique key (probably the ABObject.name)
    * @return {Lock}
    */
   Lock(key) {
      if (!this._queueLocks[key]) {
         this._queueLocks[key] = new Lock();
      }
      return this._queueLocks[key];
   }
}

var storage = new Storage();
export { storage, Storage };
