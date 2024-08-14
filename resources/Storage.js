/**
 * @class Storage
 *
 * Manages persistent storage, via a key-value interface.
 *
 */
"use strict";

import EventEmitter from "eventemitter2";
import { compressAccurately } from "image-conversion";
import CryptoJS from "crypto-js";

const DB_NAME = "app";
const DEFAULT_FILE_SLICESIZE = 512;
const EVENT_KEY_DOWNLOAD_FILE = "download.file";
const EVENT_KEY_UPLOAD_FILE = "upload.file";
const EVENT_PATH = "resources.storage";
const TIME_WAIT = 1000;
const defaultTableKeys = [
   "inbox",
   "inboxMeta",
   "jobPacket",
   "jobResponse",
   "file",
   "user",
];

class Storage extends EventEmitter {
   constructor() {
      super();
      this._queues = [];
      this._config = {
         encrypt: false,
         key: null, // 256-bit key
      };
      this._db = null;
      this._lock = null;
      this.app = null;
      this.on(EVENT_KEY_DOWNLOAD_FILE, async (context, res) => {
         const queueUUID = context.queueUUID;
         try {
            if (res.status === "error") {
               const lock = this._lock;
               try {
                  await lock.acquire();
                  await this.clear("file", queueUUID);
                  lock.release();
                  throw new Error(res.message);
               } catch (err) {
                  lock.release();
                  throw err;
               }
            }
            await this.downloadFile(null, {
               data: res.data,
               id: queueUUID,
               isConfirmed: true,
            });
         } catch (err) {
            console.error(err);
         }
         const queues = this._queues;
         const queueIndex = queues.indexOf(queueUUID);
         if (queueIndex < 0) return;
         queues.splice(queueIndex, 1);
      });
      this.on(EVENT_KEY_UPLOAD_FILE, async (context, res) => {
         const queueUUID = context.queueUUID;
         try {
            if (res.status === "error") {
               const lock = this._lock;
               try {
                  await lock.acquire;
                  await this.clear("file", queueUUID);
                  lock.release();
                  throw new Error(res.message);
               } catch (err) {
                  lock.release();
                  throw err;
               }
            }
            await this.uploadFile(null, null, null, {
               data: Object.assign({ contents: context.fileBase64 }, res.data),
               id: queueUUID,
               isConfirmed: true,
            });
         } catch (err) {
            console.error(err);
         }
         const queues = this._queues;
         const queueIndex = queues.indexOf(queueUUID);
         if (queueIndex < 0) return;
         queues.splice(queueIndex, 1);
      });
   }

   /**
    * Decrypt a string with AES, using the key from `setPassword()`.
    *
    * @param {string} encoded
    *      An encoded string produced by `encrypt()`.
    * @return {string}
    */
   _decrypt(encoded) {
      if (encoded == null) return null;
      const [ciphertext, ivHex] = encoded.split(":::");
      if (ciphertext == null || ivHex == null) return null;
      const iv = CryptoJS.enc.Hex.parse(ivHex);
      const decrypted = CryptoJS.AES.decrypt(ciphertext, this._config.key, {
         iv,
      }).toString(CryptoJS.enc.Utf8);
      return decrypted;
   }

   /**
    * Encrypt a string with AES, using the key from `setPassword()`.
    *
    * @param {string} plaintext
    * @return {string}
    *      Ciphertext with embedded IV.
    */
   _encrypt(plaintext) {
      const iv = CryptoJS.lib.WordArray.random(16);
      const ciphertext = CryptoJS.AES.encrypt(plaintext, this._config.key, {
         iv: iv,
      });
      return `${ciphertext}:::${iv}`;
   }

   /**
    * Early initialization. This can happen even before the auth token is
    * setup.
    *
    * @param {App} app
    *
    * @return {Promise}
    **/
   async init(app) {
      this.app = app;
      const dcs = this.app.abDCs;
      // IndexedDB is standard on modern browsers
      const _db =
         this._db ||
         (this._db = await new Promise((resolve, reject) => {
            console.assert(indexedDB, "IndexedDB is not available");
            console.assert(DB_NAME, "DB_NAME is not set");
            const request = indexedDB.open(DB_NAME);
            request.onerror = (event) => {
               reject(event.target.error);
            };
            request.onsuccess = (event) => {
               resolve(event.target.result);
            };

            // On first time, set up the obect store
            request.onupgradeneeded = (event) => {
               const db = event.target.result;
               defaultTableKeys.forEach((defaultTableKey) => {
                  db.createObjectStore(defaultTableKey);
               });
               dcs.forEach((dc) => {
                  db.createObjectStore(dc.refStorage());
               });
            };
         }));
      _db.onerror = (event) => {
         console.error("IndexedDB error", event.target.errorCode);
      };
      this._lock = new this.app.utils.Lock();
   }

   /**
    * Save something to persistent storage.
    *
    * @param {string} key
    *      Name of thing to save.
    * @param {string/object} value
    *      Value of thing to save.
    * @return {Promise}
    */
   set(tableKey, key, value) {
      const parsedValue =
         (this._config.encrypt &&
            (() => {
               const circularItems = [];
               return this._encrypt(
                  (typeof value === "object" &&
                     // Fix circular objects.
                     JSON.stringify(value, (key, value) => {
                        if (typeof value === "object" && value !== null) {
                           // Duplicate reference found, discard key
                           if (circularItems.includes(value)) return;

                           // Store value in our collection
                           circularItems.push(value);
                        }
                        return value;
                     })) ||
                     value,
               );
            })()) ||
         value;
      return new Promise((resolve, reject) => {
         console.assert(key, "key is required");
         console.assert(tableKey, "tableKey is required");
         console.assert(this._db, "this._db is required");
         console.assert(
            this._db.objectStoreNames,
            "this._db.objectStoreNames is required",
         );
         const transaction = this._db.transaction(tableKey, "readwrite");

         transaction.oncomplete = () => {
            resolve();
         };
         transaction.onerror = () => {
            console.error("DB error during set", transaction.error);
            reject(transaction.error);
         };
         transaction.objectStore(tableKey).put(parsedValue, key);
      });
   }

   /**
    * Load something from persistent storage.
    *
    * @param {string} key
    *      Name of thing to load.
    * @return {Promise}
    */
   get(tableKey, key) {
      return new Promise((resolve, reject) => {
         const transaction = this._db.transaction(tableKey, "readonly");
         transaction.onerror = () => {
            console.error("DB error during get", transaction.error);
            reject(transaction.error);
         };
         const store = transaction.objectStore(tableKey);
         const req = store.get(key);
         req.onsuccess = () => {
            const result = req.result;
            const value =
               (this._config.encrypt && this._decrypt(result)) || result;
            try {
               resolve(JSON.parse(value));
            } catch (err) {
               resolve(value);
            }
         };
      });
   }

   /**
    * Return the count of entries in a given tabkeKey
    *
    * @param {string} tableKey
    *      Name of the Table to return a count of records from.
    * @return {Promise}
    */
   count(tableKey) {
      return new Promise((resolve, reject) => {
         const transaction = this._db.transaction(tableKey, "readonly");
         transaction.onerror = () => {
            console.error("DB error during count", transaction.error);
            reject(transaction.error);
         };
         const store = transaction.objectStore(tableKey);
         const req = store.count();
         req.onsuccess = () => {
            resolve(req.result);
         };
      });
   }

   /**
    * Load something from persistent storage.
    *
    * @param {string} key
    *      Name of thing to load.
    * @param {object} [options]
    * @param {boolean} [deserialize]
    *      Deserialize loaded value with JSON.parse().
    *      Default true.
    * @return {Promise}
    */
   getAll(tableKey, query) {
      return new Promise((resolve, reject) => {
         const transaction = this._db.transaction(tableKey, "readonly");
         transaction.onerror = () => {
            console.error("DB error during get", transaction.error);
            reject(transaction.error);
         };
         const store = transaction.objectStore(tableKey);
         const req = store.getAll(query);
         req.onsuccess = () => {
            resolve(
               req.result.map((e) => {
                  const result = this._decrypt(e);
                  try {
                     return JSON.parse(result);
                  } catch (err) {
                     return result;
                  }
               }),
            );
         };
      });
   }

   getAllKeys(tableKey, query) {
      return new Promise((resolve, reject) => {
         try {
            const transaction = this._db.transaction(tableKey, "readonly");
            transaction.onerror = () => {
               console.error("DB error during get", transaction.error);
               reject(transaction.error);
            };
            const store = transaction.objectStore(tableKey);
            const req = store.getAllKeys(query);
            req.onsuccess = () => {
               resolve(req.result);
            };
         } catch (e) {
            if (e.toString().indexOf("object stores was not found") > -1) {
               resolve([]);
            } else {
               reject(e);
            }
         }
      });
   }

   /**
    * Delete the specified record from storage.
    * Note that the 'record' is the whole object stored under the key.
    * @param {string} key
    * @return {Promise}
    */
   clear(tableKey, key) {
      return new Promise((resolve, reject) => {
         const transaction = this._db.transaction(tableKey, "readwrite");
         transaction.onerror = (event) => {
            console.error("DB error during clear", event.error);
            reject(event.error);
         };
         const store = transaction.objectStore(tableKey);
         const req = store.delete(key);
         req.onsuccess = () => {
            resolve();
         };
      });
   }

   /**
    * Delete all records from storage.
    *
    * @return {Promise}
    */
   clearAll(tableKey, keyRange) {
      return new Promise((resolve, reject) => {
         try {
            const transaction = this._db.transaction(tableKey, "readwrite");
            transaction.onerror = (event) => {
               console.error("DB error during clearAll", event.error);
               reject(event.error);
            };
            const store = transaction.objectStore(tableKey);
            if (keyRange) {
               const req = store.delete(keyRange);
               req.onsuccess = () => {
                  resolve();
               };
            } else {
               const req = store.clear();
               req.onsuccess = () => {
                  resolve();
               };
            }
         } catch (e) {
            if (e.toString().indexOf("not found") > -1) {
               // sometimes we get back a strange # value
               resolve();
               return;
            }
            console.error(e);
            console.warn("tableKey:" + tableKey);
            reject();
         }
      });
   }

   /**
    * Compress a file using the browser's built-in compression.
    * * @param {Blob} file
    */
   async compressFile(file) {
      return new Promise((resolve, reject) => {
         new compressAccurately(file, 100).then((compressedFile) => {
            //The res in the promise is a compressed Blob type (which can be treated as a File type) file;
            if (compressedFile instanceof Blob) {
               // Convert Blob to File if needed
               const compressedFileFromBlob = new File(
                  [compressedFile],
                  file.name,
                  {
                     type: compressedFile.type,
                  },
               );
               resolve(compressedFileFromBlob);
            } else {
               reject(new Error("Invalid compressed file format"));
            }
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
      const sliceSize = options.sliceSize || DEFAULT_FILE_SLICESIZE;
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
         reader.onloadend = () => {
            const base64 = reader.result.split(",")[1]; // Remove data URL prefix
            resolve(base64);
         };
         reader.readAsDataURL(file);
      });
   }

   async downloadFile(key, backupData) {
      const lock = this._lock;
      let isSaved = true;
      const resData =
         backupData ||
         (await new Promise((resolve, reject) => {
            (async () => {
               try {
                  await lock.acquire();
                  const storedValue = await this.get("file", key);
                  if (storedValue != null) {
                     isSaved = false;
                     resolve(storedValue);
                     if (storedValue.isConfirmed) {
                        lock.release();
                        return;
                     }
                  } else
                     resolve({
                        data: {
                           contents: null,
                           file: null,
                           type: null,
                           uuid: key,
                        },
                        id: key,
                        isConfirmed: false,
                     });
                  lock.release();
               } catch (err) {
                  reject(err);
                  lock.release();
                  return;
               }
               const network = this.app.resources.network;
               const queues = this._queues;
               try {
                  if (queues.indexOf(key) > -1) {
                     const result = await new Promise((resolve2, reject2) => {
                        const waitForSync = () => {
                           setTimeout(async () => {
                              try {
                                 await lock.acquire();
                                 if (queues.indexOf(key) > -1) waitForSync();
                                 else
                                    resolve2(
                                       (await this.get("file", key)) || null,
                                    );
                                 lock.release();
                              } catch (err) {
                                 reject2(err);
                                 lock.release();
                              }
                           }, TIME_WAIT);
                        };
                        waitForSync();
                     });
                     if (result != null && result.isConfirmed) return;
                  }
                  queues.push(key);
                  await network.get(
                     {
                        url: network.validRoutes.fileBase64Download.replace(
                           ":uuid",
                           key,
                        ),
                     },
                     {
                        context: {
                           queueUUID: key,
                           targetEventKey: EVENT_KEY_DOWNLOAD_FILE,
                           targetEventPath: EVENT_PATH,
                        },
                     },
                  );
               } catch (err) {
                  console.error(err);
               }
            })();
         }));
      if (!isSaved) return resData;
      try {
         await lock.acquire();
         await this.set("file", resData.id, resData);
         lock.release();
         this.emit("file-updated");
         return resData;
      } catch (err) {
         lock.release();
         throw err;
      }
   }

   async uploadFile(objID, fieldID, data, backupData) {
      const lock = this._lock;
      const resData =
         backupData ||
         (await new Promise((resolve, reject) => {
            const app = this.app;
            const network = app.resources.network;
            (async () => {
               const file = data.file;
               let fileBase64 = null;
               try {
                  fileBase64 = await this.convertFileToBase64Data(file);
               } catch (err) {
                  reject(err);
               }
               const queueUUID = app.utils.uuidv4();
               resolve({
                  data: {
                     contents: fileBase64,
                     file: file.name,
                     type: file.type,
                     uuid: queueUUID,
                  },
                  id: queueUUID,
                  isConfirmed: false,
               });
               try {
                  this._queues.push(queueUUID);
                  await network.post(
                     {
                        url: network.validRoutes.fileBase64Upload.replace(
                           ":objID/:fieldID",
                           `${objID}/${fieldID}`,
                        ),
                        data: {
                           fieldID,
                           file: fileBase64,
                           fileID: queueUUID,
                           fileName: `${queueUUID}_${file.name}`,
                           objID,
                           type: file.type,
                           uploadedBy: data.uploadedBy,
                        },
                     },
                     {
                        context: {
                           fileBase64,
                           queueUUID,
                           targetEventKey: EVENT_KEY_UPLOAD_FILE,
                           targetEventPath: EVENT_PATH,
                        },
                     },
                  );
               } catch (err) {
                  console.error(err);
               }
            })();
         }));
      try {
         await lock.acquire();
         await this.set("file", resData.id, resData);
         lock.release();
         return resData;
      } catch (err) {
         lock.release();
         throw err;
      }
   }

   get config() {
      return structuredClone(this._config);
   }

   set config(values = {}) {
      this._config.encrypt = values.encrypt ?? this._config.encrypt;
      this._config.key = values.encrypt || this._config.key;
   }

   get validFileTypes() {
      return ["image/jpg", "image/jpeg", "image/png", "image/gif", "image/bmp"];
   }

   get validStorageKeys() {
      try {
         return structuredClone(this._db.objectStoreNames);
      } catch (err) {
         let vals = [];
         for (const e in this._db.objectStoreNames) {
            vals.push(this._db.objectStoreNames[e]);
         }
         return vals;
      }
   }
}

export default new Storage();
