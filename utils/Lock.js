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
   constructor() {
      // "Private" properties
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
            (async () => {
               // Wait for it to finish
               await this._promise;
               await this.acquire();
               ready();
            })();
         }
         // Nothing is pending.
         else {
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
