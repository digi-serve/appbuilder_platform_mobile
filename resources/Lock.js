/**
 * @class Lock
 * Simple mutex lock based on Promises.
 *
 * After a lock is first acquired, further attempts to acquire it again will
 * be queued until it is released.
 *
 * Example:
 *      var lock = new Lock();
 *      lock.acquire()
 *      .then(() => {
 *          // do stuff
 *          return asyncFunc1();
 *      })
 *      .then(() => {
 *          // do more stuff
 *          return asyncFunc2();
 *      })
 *      .finally(() => {
 *          lock.release();
 *      });
 */
"use strict";

   class Lock {
      constructor(key) {
         // "Private" properties
         this._key = key;
         this._promise = null;
         this._resolve = null;
      }

      /**
       * return {Promise}
       */
      acquire() {
         return new Promise((ready) => {
            // Another lock is already pending
            if (this._promise) {
               // Wait for it to finish
               this._promise
                  .then(() => {
                     // Acquire fresh lock
                     return this.acquire();
                  })
                  .then(() => {
                     ready();
                  });
            }
            // Nothing is pending.
            else {
               console.log(this._key)
               this._promise = new Promise((_resolve) => {
                  this._resolve = _resolve;
               });
               ready();
            }
         });
      }

      release() {
         if (this._promise) {
            this._promise = null;
            this._resolve();
         } else {
            throw new Error("Attempt to release invalid lock");
         }
      }
   }

   export default Lock;
