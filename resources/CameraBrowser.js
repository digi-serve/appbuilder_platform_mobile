/**
 * @class CameraBrowser
 *
 * Manages taking photos with the device's camera, and saving them to the
 * app's data directory.
 *
 * This version overrides the CameraPlatform and makes the image saving
 * routines suitable for a browser environment.
 */
"use strict";

/* global PERSISTENT */
import async from "async";
import CameraPlatform from "./CameraPlatform";
import Log from "./Log";

import { storage } from "../../platform/resources/Storage.js";

class CameraBrowser extends CameraPlatform {
   constructor() {
      super();

      Log("Camera: CameraBrowser in use.");
   }

   /**
    * init()
    * in CameraBrowser we need to request storage from the browser's
    * persistent storage.
    */
   init() {
      return new Promise((resolve, reject) => {
         var onInitFs = (data /*, _rootDirEntry */) => {
            Log("onInitFS: name:", data.name);
            Log("onInitFS: DE:", data.root);

            this._testDirectoryEntry = data.root;
            resolve();
         };
         var errorHandler = (error) => {
            console.error("*** Error loading _testDirectoryEntry:");
            console.error(error);
            reject(error);
         };
         var requestedBytes = 1024 * 1024 * 10;

         navigator.webkitPersistentStorage.requestQuota(
            requestedBytes,
            function(grantedBytes) {
               window.webkitRequestFileSystem(
                  PERSISTENT,
                  grantedBytes,
                  onInitFs,
                  errorHandler
               );
            },
            function(e) {
               Log("CameraBrowser.js:init():requestQuota():Error", e);
            }
         );
      });
   }

   deleteLocalImages() {
      return new Promise((resolve, reject) => {
         // make sure _testDirectoryEntry is created before trying to use:
         if (!this._testDirectoryEntry) {
            this.init().then(() => {
               this.imageCleanUp()
                  .then((data) => {
                     resolve(data);
                  })
                  .catch(reject);
            });
            return;
         }

         // Get a directory reader
         var directoryReader = this._testDirectoryEntry.createReader();
         // Get a list of all the entries in the directory
         directoryReader.readEntries(
            (entries) => {
               entries.forEach((item, i) => {
                  item.remove(
                     function() {
                        console.log("File removed");
                        if (item.name.indexOf("receipt-") > -1) {
                           storage.set(
                              "Receipt Image-" +
                                 item.name
                                    .replace("receipt-", "")
                                    .replace(".jpg", ""),
                              null
                           );
                        }
                     },
                     function() {
                        console.log("Error while removing file");
                     }
                  );
               });
               resolve();
            },
            (error) => {
               reject("Failed during operations: " + error.code);
            }
         );
      });
   }

   imageCleanUp() {
      return new Promise((resolve, reject) => {
         // make sure _testDirectoryEntry is created before trying to use:
         if (!this._testDirectoryEntry) {
            this.init().then(() => {
               this.imageCleanUp()
                  .then((data) => {
                     resolve(data);
                  })
                  .catch(reject);
            });
            return;
         }

         // Get a directory reader
         var directoryReader = this._testDirectoryEntry.createReader();
         // Get a list of all the entries in the directory
         directoryReader.readEntries(
            (entries) => {
               var currentDate = new Date();
               var currentTime = currentDate.getTime();
               entries.forEach((item, i) => {
                  if (item.isFile && item.name.indexOf("receipt-") > -1) {
                     item.getMetadata(
                        (file) => {
                           var timeDiff = Math.abs(
                              currentTime - file.modificationTime.getTime()
                           );
                           var diff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                           if (diff > 14) {
                              item.remove(
                                 function() {
                                    console.log("File removed");
                                    if (item.name.indexOf("receipt-") > -1) {
                                       storage.set(
                                          "Receipt Image-" +
                                             item.name
                                                .replace("receipt-", "")
                                                .replace(".jpg", ""),
                                          null
                                       );
                                    }
                                 },
                                 function() {
                                    console.log("Error while removing file");
                                 }
                              );
                           }
                        },
                        (error) => {
                           reject(error);
                        }
                     );
                  }
               });
            },
            (error) => {
               reject("Failed during operations: " + error.code);
            }
         );
      });
   }

   imageLookUp() {
      return new Promise((resolve, reject) => {
         // make sure _testDirectoryEntry is created before trying to use:
         if (!this._testDirectoryEntry) {
            this.init().then(() => {
               this.imageLookUp()
                  .then((data) => {
                     resolve(data);
                  })
                  .catch((err) => {
                     reject(err);
                  });
            });
            return;
         }

         // Get a directory reader
         var directoryReader = this._testDirectoryEntry.createReader();
         // Get a list of all the entries in the directory
         directoryReader.readEntries(
            (entries) => {
               var totalStorage = 0;
               var allFiles = [];
               entries.forEach((item, i) => {
                  if (item.isFile) {
                     allFiles.push(
                        new Promise((resolve, reject) => {
                           item.file(
                              (file) => {
                                 console.log("File size: " + file.size);
                                 totalStorage += file.size;
                                 resolve(totalStorage);
                              },
                              (error) => {
                                 console.log(error);
                                 reject(error);
                              }
                           );
                        })
                     );
                  }
               });
               Promise.all(allFiles).then((values) => {
                  var totalMB = totalStorage / 1000000; //bytes to megabytes rounded to two decimal places
                  console.log("Total Storage: " + totalMB.toFixed(2));
                  resolve(totalMB);
               });
            },
            (error) => {
               reject("Failed during operations: " + error.code);
            }
         );
      });
   }

   ////////
   // Photo file management
   ////////

   /**
    * Loads the FileEntry of a previously saved photo by its filename.
    *
    * @param {string} filename
    * @return {Promise}
    *      {
    *          filename: <string>,
    *          fileEntry: <FileEntry>,
    *          url: <string>, // only valid for current session
    *          cdvfile: <string> // alternate Cordova URL that is persistent
    *      }
    */
   loadPhotoByName(filename) {
      return new Promise((resolve, reject) => {
         // make sure _testDirectoryEntry is created before trying to use:
         if (!this._testDirectoryEntry) {
            this.init().then(() => {
               this.loadPhotoByName(filename)
                  .then((data) => {
                     resolve(data);
                  })
                  .catch(reject);
            });
            return;
         }

         this._testDirectoryEntry.getFile(
            filename,
            { create: false, exclusive: false },
            (_fileEntry) => {
               resolve({
                  filename: filename,
                  fileEntry: _fileEntry,
                  url: _fileEntry.toURL(),
                  cdvfile: _fileEntry.toURL() //_fileEntry.toInternalURL()
               });
            },
            (err) => {
               Log("Unable to find photo file", err);
               reject(err);
            }
         );
      });
   }

   /**
    * Assing an existing photo file a new name within the same directory.
    *
    * @param {string} fromName
    * @param {string} toName
    * @return {Promise}
    */
   rename(fromName, toName) {
      return new Promise((resolve, reject) => {
         var fileEntry;

         async.series(
            [
               // Preliminary checks
               (next) => {
                  // No special chars
                  if (toName.match(/[^\w-]/)) {
                     next(
                        new Error(
                           "Attempting to rename file to an invalid name"
                        )
                     );
                  } else next();
               },

               // Obtain FileEntry
               (next) => {
                  this.loadPhotoByName(fromName)
                     .then((metadata) => {
                        fileEntry = metadata.fileEntry;
                        next();
                     })
                     .catch(next);
               },

               // Rename
               (next) => {
                  fileEntry.moveTo(
                     this._testDirectoryEntry,
                     toName,
                     () => {
                        next();
                     },
                     (err) => {
                        Log("Error while trying to rename photo");
                        next(err);
                     }
                  );
               }
            ],
            (err) => {
               if (err) reject(err);
               else resolve();
            }
         );
      });
   }

   /**
    * Save binary data to a file.
    *
    * @param {Blob?} data
    * @param {string} filename
    * @return {Promise}
    */
   saveBinaryToName(data, filename) {
      return new Promise((resolve, reject) => {
         var fileEntry = null;

         if (this._testDirectoryEntry) {
            async.series(
               [
                  (next) => {
                     this._testDirectoryEntry.getFile(
                        filename,
                        { create: true, exclusive: false },
                        (_fileEntry) => {
                           fileEntry = _fileEntry;
                           next();
                        },
                        (err) => {
                           Log("Error creating file: " + filename, err);
                           next(err);
                        }
                     );
                  },

                  (next) => {
                     fileEntry.createWriter((fileWriter) => {
                        fileWriter.onwriteend = () => {
                           next();
                        };

                        fileWriter.onerror = (err) => {
                           Log("Error writing to file: " + filename, err);
                           next(err);
                        };

                        fileWriter.write(data);
                     });
                  }
               ],
               (err) => {
                  if (err) reject(err);
                  else
                     resolve({
                        filename: filename,
                        fileEntry: fileEntry,
                        url: fileEntry.toURL(),
                        cdvfile: fileEntry.toURL()
                     });
               }
            );
         } else {
            console.error("CameraBrowser.js: no fileDirectoryEntry created!");
         }
      });
   }
}

export default CameraBrowser;
