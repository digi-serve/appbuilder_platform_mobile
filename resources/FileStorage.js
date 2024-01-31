import EventEmitter from 'eventemitter2';
import analytics from './Analytics.js';
import Log from './Log.js';
import Compressor from "compressorjs";

const storeName = "file_data";
const DEFAULT_SLICESIZE = 512;

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
    * @param {string} key
    * @param {Blob} value
    * @return {Promise}
    */
   put(key, value) {
      return new Promise((resolve, reject) => {
         var transaction = this.db.transaction(storeName, "readwrite");
         transaction.oncomplete = (event) => {
            if (value.size) {
               this._updateTotalSize(value.size);
            }
            resolve();
         }
         transaction.onerror = (event) => {
            Log("DB error during put", transaction.error)
            reject(transaction.error);
         }

         var store = transaction.objectStore(storeName);
         var req = store.put(value, key);
      });
   }


   /**
    * Retrieve a stored file.
    *
    * @param {string} key
    * @return {Promise}
    *    Resolves with {File|Blob}
    */
   get(key) {
      return new Promise((resolve, reject) => {
         // Sometimes the DB may not be initialized in time
         if (!this.db) {
            console.warn("FileStorage DB not available yet. Retrying...");
            setTimeout(() => {
               this.get(key)
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
            var req = store.get(key);
            req.onsuccess = (event) => {
               let file = req.result;
               resolve(file);
            };
         }
      });
   }

   /**
    * Compress a file using the browser's built-in compression.
    * * @param {Blob} file
    */
   async compress(file, options) {
      return new Promise((resolve, reject) => {
         new Compressor(file, {
            ...options,
            // The compression process is asynchronous,
            // which means you have to access the `result` in the `success` hook function.
            success(compressedFile) {
               if (compressedFile instanceof Blob) {
                  // Convert Blob to File if needed
                  const compressedFileFromBlob = new File(
                     [compressedFile],
                     file.name,
                     {
                        type: compressedFile.type,
                     }
                  );
                  resolve(compressedFileFromBlob);
               } else {
                  reject(new Error("Invalid compressed file format"));
               }
            },
            error(err) {
               reject(err.message);
            },
         });
      });
   }
   

   /**
    * Convert base64 data to a File object.
    *
    * @param {string} filename
    * @param {string} base64Data
    * @param {Object} options
    *    endings - {string} How to interpret newline characters (\n) within the contents,
    *       if the data is text.
    *    lastModified - {number} A number representing the number of milliseconds
    *       between the Unix time epoch and when the file was last modified.
    *    sliceSize - {number} SliceSize to process the byteCharacters
    *    type - {string} the content type of the file i.e (image/jpeg - image/png - text/plain)
    * @return {File}
    */
   convertBase64DataToFile(filename, base64Data, options = {}) {
      /**
       * Convert a base64 string in a Blob according to the data.
       * @see http://stackoverflow.com/questions/16245767/creating-a-blob-from-a-base64-string-in-javascript
       */
      const sliceSize = options.sliceSize || DEFAULT_SLICESIZE;
      const byteCharacters = atob(base64Data);
      const byteArrays = [];
      for (
         let offset = 0;
         offset < byteCharacters.length;
         offset += sliceSize
      ) {
         const slice = byteCharacters.slice(offset, offset + sliceSize);
         const byteNumbers = new Array(slice.length);
         for (let i = 0; i < slice.length; i++)
            byteNumbers[i] = slice.charCodeAt(i);
         byteArrays.push(new Uint8Array(byteNumbers));
      }

      // Convert a Blob object to a File object.
      const copiedOptions = structuredClone(options);
      delete copiedOptions.sliceSize;
      return new File([new Blob(byteArrays)], filename, copiedOptions);
   }

   /**
    * Convert a File object to a base64 string.
    *
    * @param {File} file
    *      Blob to convert
    * @return {Promise}
    *      Resolves with {string}
    */
   convertFileToBase64Data(file) {
      return new Promise((resolve) => {
         const reader = new FileReader();
         reader.onloadend = function () {
            const base64 = reader.result.split(",")[1]; // Remove data URL prefix
            resolve(base64);
         };
         reader.readAsDataURL(file);
      });
   }


   /**
    * Delete a stored file.
    *
    * @param {string} key
    * @return {Promise}
    */
   delete(key) {
      return new Promise((resolve, reject) => {
         // Retrieve the stored file first
         this.get(key)
            .then((file) => {
               if (!file) {
                  console.warn("Attempt to delete non-existent file: ", key);
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
               var req = store.delete(key);
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
