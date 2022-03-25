import EventEmitter from 'eventemitter2';
import uuid from 'uuid/v1';
import { storage, Storage } from './Storage.js';
import analytics from './Analytics.js';
import Log from './Log.js';

const storeName = "file_data";

/**
 * Uses an IndexedDB backend to store file blobs. Encryption is not currently
 * supported, but is possible in principle. One difference between this and the
 * other storage engine (Storage.js) is that this does not serialize the stored
 * values into JSON. It would be too memory intensive to serialze large files
 * this way.
 */
class FileStorage extends EventEmitter {
   constructor(name='file_blobs') {
      super();

      try {
         var request = indexedDB.open(name);
         request.onerror = (event) => {
            Log("FileStorage IndexedDB failure on init", request.error);
            analytics.logError(request.error);
         }
         request.onsuccess = (event) => {
            this.db = request.result;
            this.db.onerror = (event) => {
               Log("FileStorage IndexedDB error", event.target.errorCode);
            }
            // Test if the object store is present
            var transaction = this.db.transaction(storeName, "readonly");
            transaction.onerror = (event) => {
               console.log('FileStorage IndexedDB store not found?', transaction.error);
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
            "Error initializing the file storage system:\n" +
               (err.message || "") +
               "\n" +
               (err.stack || "")
         );
         analytics.logError(err);
      }
   }


   /**
    * Update the internal counter that tracks the total size of all files
    * being stored.
    * 
    * @param {integer} sizeChange
    * @return {Promise}
    */
   _updateTotalSize(sizeChange) {
      return this.get('__totalSizeOfAllFiles')
         .then((totalSize) => {
            totalSize = totalSize || 0;
            if (sizeChange != 0) {
               totalSize += sizeChange;
               return this.put('__totalSizeOfAllFiles', totalSize);
            }
         });
   }


   /**
    * Get the total size of all files being stored.
    * 
    * @return {Promise}
    *   Resolves with {int}
    */
   getTotalSize() {
      return this.get('__totalSizeOfAllFiles')
         .then((totalSize) => {
            totalSize = totalSize || 0;
            return totalSize;
         });
   }


   /**
    * Save a file under a given name.
    *
    * @param {string} name
    * @param {Blob} data
    * @return {Promise}
    */
   put(name, file) {
      return new Promise((resolve, reject) => {
         var transaction = this.db.transaction(storeName, "readwrite");
         transaction.oncomplete = (event) => {
            if (file.size) {
               this._updateTotalSize(file.size);
            }
            resolve();
         }
         transaction.onerror = (event) => {
            Log("DB error during put", transaction.error)
            reject(transaction.error);
         }

         var store = transaction.objectStore(storeName);
         var req = store.put(file, name);
      });
   }


   /**
    * Retrieve a stored file.
    *
    * @param {string} name
    * @return {Promise}
    *    Resolves with {File|Blob}
    */
   get(name) {
      return new Promise((resolve, reject) => {
         // Sometimes the DB may not be initialized in time
         if (!this.db) {
            console.warn("FileStorage DB not available yet. Retrying...");
            setTimeout(() => {
               this.get(name)
                  .then(resolve)
                  .catch(reject);
            }, 50);
         }
         // DB is ready now
         else {
            var transaction = this.db.transaction(storeName, "readonly");
            transaction.onerror = (event) => {
               Log("FileStorage DB error during get", transaction.error)
               reject(transaction.error);
            }

            var store = transaction.objectStore(storeName);
            var req = store.get(name);
            req.onsuccess = (event) => {
               let file = req.result;
               resolve(file);
            }
         }
      });
   }


   /**
    * Retrieve the URL of a stored file.
    *
    * To prevent memory leaks, you can call URL.revokeObjectURL() on the URL
    * after you are done with it.
    *
    * @param {string} name
    * @return {Promise}
    *    Resolves with {string}
    */
   getURL(name) {
      return this.get(name)
         .then((file) => {
            return URL.createObjectURL(file);
         })
   }


   /**
    * Delete a stored file.
    *
    * @param {string} name
    * @return {Promise}
    */
   delete(name) {
      return new Promise((resolve, reject) => {
         // Retrieve the stored file first
         this.get(name)
            .then((file) => {
               if (!file) {
                  console.warn("Attempt to delete non-existent file: ", name);
                  resolve();
                  return;
               }

               var fileSize = file.size;
               var transaction = this.db.transaction(storeName, "readwrite");
               transaction.onerror = (event) => {
                  Log("FileStorage DB error during delete", event.error);
                  analytics.logError(event.error);
                  reject(event.error);
               }
               var store = transaction.objectStore(storeName);
               var req = store.delete(name);
               req.onsuccess = (event) => {
                  this._updateTotalSize(-fileSize);
                  resolve();
               }
            })
            .catch((err) => {
               reject(err);
            });
      });
   }


   /**
    * Delete all stored files.
    *
    * @return {Promise}
    */
   deleteAll() {
      return new Promise((resolve, reject) => {
         var transaction = this.db.transaction(storeName, "readwrite");
         transaction.onerror = (event) => {
            Log("FileStorage DB error during deleteAll", event.error);
            analytics.logError(event.error);
            reject(event.error);
         }
         var store = transaction.objectStore(storeName);
         var req = store.clear();
         req.onsuccess = (event) => {
            resolve();
         }
      });
   }
}

var fileStorage = new FileStorage();
export default fileStorage;
