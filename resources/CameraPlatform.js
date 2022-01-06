/**
 * @class CameraPlatform
 *
 * Manages taking photos with the device's camera, and saving them to the
 * app's data directory.
 *
 * You can use getCameraPhoto() or getLibraryPhoto() to obtain an image file.
 *
 * Previously, it was possible to use the permanent `cdvfile` value of that
 * image to display it in the DOM (inside an <img> tag). This is no longer
 * possible in iOS. Now only the temporary `url` value can be displayed.
 *
 * Because it is temporary, the `url` cannot be reliably stored for future use.
 * Instead, store the image filename. Then later when you need to display the
 * image, use tempUrl(filename) to obtain a fresh URL.
 *
 * Exports a singleton instance.
 */
"use strict";

import async from "async";
import EventEmitter from "eventemitter2";
import Log from "./Log";
import uuid from "uuid/v1";

import { storage } from "../../platform/resources/Storage.js";

const defaultHeight = 2000;
const defaultWidth = 2000;

var canEditPhoto = false;
if (navigator.userAgent.match(/android/i)) {
   // Documentation says that Android devices can have unpredictable behaviour
   // when attempting to edit photos.
   canEditPhoto = false;
}

class CameraPlatform extends EventEmitter {
   constructor() {
      super();

      this.directoryEntry = null;
      this.tempDirectoryEntry = null;
      this.camera = {
         getPicture: () => {
            return Promise.reject(new Error("Device not ready"));
         },
      };

      this.init();
   }

   init() {
      document.addEventListener(
         "deviceready",
         () => {
            this.camera = navigator.camera;

            async.parallel(
               [
                  // Data directory
                  (next) => {
                     window.resolveLocalFileSystemURL(
                        cordova.file.dataDirectory,
                        (_directoryEntry) => {
                           this.directoryEntry = _directoryEntry;
                           next();
                        },
                        (err) => {
                           console.log("Could not get data directory", err);
                           // Should we halt here?
                           next();
                        }
                     );
                  },
                  // Temp directory
                  (next) => {
                     if (!cordova.file.tempDirectory) {
                        return next();
                     }
                     window.resolveLocalFileSystemURL(
                        cordova.file.tempDirectory,
                        (_directoryEntry) => {
                           this.tempDirectoryEntry = _directoryEntry;
                           next();
                        },
                        (err) => {
                           console.log("Could not get temp directory", err);
                           // Not critical. Probably just Android?
                           next();
                        }
                     );
                  },
               ],
               (err) => {
                  if (err) {
                  }
                  this.emit("ready");
               }
            );
         },
         false
      );
   }

   //////
   //  Camera
   //////

   /**
    * Activate the camera for the user, and obtain the photo taken.
    *
    * @param {int} width
    * @param {int} height
    * @return {Promise}
    *    Resolves with metadata of the saved photo.
    *    {
    *       filename: <string>,
    *       fileEntry: <FileEntry>,
    *       url: <string>, // only valid for current session
    *       cdvfile: <string> // alternate Cordova URL that is persistent
    *                         // this does not work on iOS anymore!
    *    }
    */
   getCameraPhoto(width = defaultWidth, height = defaultHeight) {
      return new Promise((resolve, reject) => {
         this.camera.getPicture(
            (imageURI) => {
               this.savePhoto(imageURI)
                  .then((result) => {
                     this.camera.cleanup();
                     resolve(result);
                  })
                  .catch(reject);
            },
            (err) => {
               Log("CameraPlatform:getCameraPhoto():Error", err);
               reject(err);
            },
            {
               saveToPhotoAlbum: false,
               cameraDirection: window.Camera.Direction.BACK,
               allowEdit: canEditPhoto,
               encodingType: window.Camera.EncodingType.JPEG,
               mediaType: window.Camera.MediaType.PICTURE,
               sourceType: window.Camera.PictureSourceType.CAMERA,
               correctOrientation: true,
               targetWidth: width,
               targetHeight: height,
            }
         );
      });
   }

   /**
    * Prompt the user to select an existing photo from their library, and
    * obtain a copy of the chosen photo.
    *
    * @param {int} width
    * @param {int} height
    * @return {Promise}
    *    Resolves with metadata of the copied photo.
    *    {
    *       filename: <stirng>,
    *       fileEntry: <FileEntry>,
    *       url: <string>, // only valid for current session
    *       cdvfile: <string> // alternate Cordova URL that is persistent
    *                         // this does not work on iOS anymore!
    *    }
    */
   getLibraryPhoto(width = defaultWidth, height = defaultHeight) {
      return new Promise((resolve, reject) => {
         this.camera.getPicture(
            (imageURI) => {
               this.resizeImage(width, imageURI);
            },
            (err) => {
               Log("Error", err);
               reject(err);
            },
            {
               saveToPhotoAlbum: false,
               allowEdit: canEditPhoto,
               encodingType: window.Camera.EncodingType.JPEG,
               mediaType: window.Camera.MediaType.PICTURE,
               sourceType: window.Camera.PictureSourceType.SAVEDPHOTOALBUM,
               targetWidth: width,
               targetHeight: height,
            }
         );
      });
   }

   ////////
   // Photo file management
   ////////

   resizeImage(longSideMax = defaultWidth, url) {
      var tempImg = new Image();
      tempImg.src = url;
      tempImg.onload = function () {
         // Get image size and aspect ratio.
         var targetWidth = tempImg.width;
         var targetHeight = tempImg.height;
         var aspect = tempImg.width / tempImg.height;

         // Calculate shorter side length, keeping aspect ratio on image.
         // If source image size is less than given longSideMax, then it need to be
         // considered instead.
         if (tempImg.width > tempImg.height) {
            longSideMax = Math.min(tempImg.width, longSideMax);
            targetWidth = longSideMax;
            targetHeight = longSideMax / aspect;
         } else {
            longSideMax = Math.min(tempImg.height, longSideMax);
            targetHeight = longSideMax;
            targetWidth = longSideMax * aspect;
         }

         // Create canvas of required size.
         var canvas = document.createElement("canvas");
         canvas.width = targetWidth;
         canvas.height = targetHeight;

         var ctx = canvas.getContext("2d");
         // Take image from top left corner to bottom right corner and draw the image
         // on canvas to completely fill into.
         ctx.drawImage(
            this,
            0,
            0,
            tempImg.width,
            tempImg.height,
            0,
            0,
            targetWidth,
            targetHeight
         );

         // callback(canvas.toDataURL("image/jpeg"));
         this.savePhoto(canvas.toDataURL("image/jpeg"))
            .then((result) => {
               resolve(result);
            })
            .catch(reject);
      };
   }

   /**
    * Copies an existing image into the temp directory and delivers the
    * URL for it.
    *
    * This is necessary if you need to display in an <img> tag under iOS.
    * Under Android, this will simply deliver the URL of the original
    * image without making any copy.
    *
    * @param {string|FileEntry} imageFile
    *      Either a string filename, or a FileEntry object for this image
    *      file.
    * @return {Promise}
    *      Resolves with the URL to the temp image.
    */
   tempUrl(imageFile) {
      return new Promise((resolve, reject) => {
         let fileEntry;
         async.series(
            [
               (next) => {
                  // Get the FileEntry via the filename
                  if (typeof imageFile == "string") {
                     this.loadPhotoByName(imageFile)
                        .then((image) => {
                           fileEntry = image.fileEntry;
                           next();
                        })
                        .catch((err) => {
                           next(err);
                        });
                  } else if (imageFile instanceof FileEntry) {
                     // FileEntry is provided
                     fileEntry = imageFile;
                     next();
                  } else {
                     next(TypeError());
                  }
               },

               (next) => {
                  if (this.tempDirectoryEntry) {
                     // Check if the temp file already exisits
                     this.tempDirectoryEntry.getFile(
                        fileEntry.name,
                        { create: false, exclusive: false },
                        (_fileEntry) => {
                           fileEntry = _fileEntry;
                           next();
                        },
                        (err) => {
                           Log(
                              "File not found copying from data directory",
                              err
                           );
                           // Copy the image to the temp directory
                           fileEntry.copyTo(
                              this.tempDirectoryEntry,
                              fileEntry.name,
                              (_newFileEntry) => {
                                 fileEntry = _newFileEntry;
                                 next();
                              },
                              (err) => {
                                 Log("Error while trying to copy photo");
                                 next(err);
                              }
                           );
                        }
                     );
                  } else {
                     // No temp directory. So we will just be
                     // returning the URL of the original file.
                     next();
                  }
               },
            ],
            (err) => {
               if (err) {
                  reject(err);
               } else {
                  let url = fileEntry.toURL();
                  resolve(url);
               }
            }
         );
      });
   }

   /**
    * Remove a photo by its filename.
    *
    * @param {string} photoName
    * @return {Promise}
    */
   deletePhoto(photoName) {
      return new Promise((resolve, reject) => {
         var fileEntry;

         async.series(
            [
               // Obtain FileEntry
               (next) => {
                  this.loadPhotoByName(photoName)
                     .then((metadata) => {
                        fileEntry = metadata.fileEntry;
                        next();
                     })
                     .catch(next);
               },

               (next) => {
                  fileEntry.remove(
                     function (/* file */) {
                        // File deleted successfully
                        next();
                     },
                     function (err) {
                        // Error while removing File
                        next(err);
                     }
                  );
               },
            ],

            (err) => {
               if (err) reject(err);
               else {
                  resolve();
               }
            }
         );
      });
   }

   /**
    * Takes an imageURI and saves a copy of the photo to the app's data
    * directory. Used internally to save persistent copies of photos from
    * the camera.
    *
    * @param {string} imageURI
    * @return {Promise}
    *    {
    *       filename: <string>,
    *       fileEntry: <FileEntry>,
    *       url: <string>, // only valid for current session
    *       cdvfile: <string> // alternate Cordova URL that is persistent
    *                         // does not work on iOS anymore!
    *    }
    */
   savePhoto(imageURI) {
      return new Promise((resolve, reject) => {
         var sourceFileEntry, targetFileEntry;
         var tempFileUrl;
         var filename = uuid() + ".jpg";

         // Remove any querystring from the imageURI
         if (imageURI.match(/[?]/)) {
            imageURI = imageURI.match(/^[^?]+/)[0];
         }

         /*
            // Android quirk
            if (navigator.userAgent.match(/Android/)) {
                if (!imageURI.match(/^filesystem:/)) {
                    imageURI = 'filesystem:' + imageURI;
                }
            }
            */

         async.series(
            [
               (next) => {
                  // Get source fileEntry
                  window.resolveLocalFileSystemURL(
                     imageURI,
                     (_fileEntry) => {
                        sourceFileEntry = _fileEntry;
                        next();
                     },
                     (err) => {
                        Log("Unable to get file from URI", imageURI, err);
                        next(err);
                     }
                  );
               },
               (next) => {
                  // Copy file to data directory
                  sourceFileEntry.copyTo(
                     this.directoryEntry,
                     filename,
                     () => {
                        next();
                     },
                     (err) => {
                        Log("Unable to copy file", err);
                        next(err);
                     }
                  );
               },
               (next) => {
                  // Get target fileEntry
                  this.directoryEntry.getFile(
                     filename,
                     { create: false, exclusive: false },
                     (_fileEntry) => {
                        targetFileEntry = _fileEntry;
                        next();
                     },
                     (err) => {
                        Log("Unable to find copied file", err);
                        next(err);
                     }
                  );
               },
               (next) => {
                  // On iOS we can only display the image url if it is
                  // located in a temp directory.
                  this.tempUrl(targetFileEntry).then((url) => {
                     tempFileUrl = url;
                     next();
                  });
               },
            ],

            (err) => {
               if (err) reject(err);
               else {
                  resolve({
                     filename: filename,
                     fileEntry: targetFileEntry,
                     url: tempFileUrl,
                     cdvfile: targetFileEntry.toInternalURL(),
                  });
               }
            }
         );
      });
   }

   deleteLocalImages() {
      return new Promise((resolve, reject) => {
         // make sure _testDirectoryEntry is created before trying to use:
         if (!this.directoryEntry) {
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
         var directoryReader = this.directoryEntry.createReader();
         // Get a list of all the entries in the directory
         directoryReader.readEntries(
            (entries) => {
               entries.forEach((item, i) => {
                  if (item.name.indexOf("receipt-") > -1) {
                     item.remove(
                        function () {
                           console.log("File removed");
                        },
                        function () {
                           console.log("Error while removing file");
                        }
                     );
                  }
               });
               resolve();
            },
            (error) => {
               reject("Failed during operations: " + error.code);
            }
         );
         var range = IDBKeyRange.bound(
            "Receipt Image-0",
            "Receipt Image-z",
            false,
            false
         );
         storage.clearAll(range);
      });
   }

   imageCleanUp() {
      return new Promise((resolve, reject) => {
         // make sure _testDirectoryEntry is created before trying to use:
         if (!this.directoryEntry) {
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
         var directoryReader = this.directoryEntry.createReader();
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
                                 function () {
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
                                 function () {
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
         if (!this.directoryEntry) {
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
         var directoryReader = this.directoryEntry.createReader();
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

   /**
    * Loads the FileEntry of a previously saved photo by its filename.
    *
    * @param {string} filename
    * @return {Promise}
    *    {
    *       filename: <string>,
    *       fileEntry: <FileEntry>,
    *       url: <string>, // only valid for current session
    *       cdvfile: <string> // alternate Cordova URL that is persistent
    *                         // this does not work on iOS anymore!
    *    }
    */
   loadPhotoByName(filename) {
      return new Promise((resolve, reject) => {
         // Get target fileEntry
         this.directoryEntry.getFile(
            filename,
            { create: false, exclusive: false },
            (_fileEntry) => {
               resolve({
                  filename: filename,
                  fileEntry: _fileEntry,
                  url: _fileEntry.toURL(),
                  cdvfile: _fileEntry.toInternalURL(),
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
    * Takes an <IMG> element and sets its src property to the URL of the
    * specified photo.
    *
    * The photo is loaded asynchronously and its URL may take some time
    * before it is ready.
    *
    * @param {string} filename
    * @param {element/jQuery} img
    */
   loadPhotoByNameIntoImg(filename, img) {
      if (filename) {
         var $img = $(img);

         this.loadPhotoByName(filename).then((result) => {
            $img.attr("src", result.url);
         });
      }
   }

   /**
    * Read the given file's data and deliver it as a base64 ascii string.
    *
    * @param {string} name
    *      Filename
    * @return {Promise}
    *      Resolves with {string}
    */
   base64ByName(name) {
      return new Promise((resolve, reject) => {
         this.loadPhotoByName(name)
            .then((metadata) => {
               metadata.fileEntry.file((file) => {
                  // Read the file's data
                  var reader = new FileReader();
                  reader.onloadend = function () {
                     var binary = this.result;
                     var base64 = window.btoa(binary);
                     resolve(base64);
                  };
                  reader.readAsBinaryString(file);
               });
            })
            .catch(reject);
      });
   }

   /**
    * Read the given file's data and deliver it as a Blob.
    *
    * @param {string} name
    *      Filename
    * @return {Promise}
    *      Resolves with {Blob}
    */
   blobByName(name) {
      return new Promise((resolve, reject) => {
         this.loadPhotoByName(name)
            .then((metadata) => {
               metadata.fileEntry.file((file) => {
                  var blob = file;
                  resolve(blob);
               });
            })
            .catch(reject);
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
                     this.directoryEntry,
                     toName,
                     () => {
                        next();
                     },
                     (err) => {
                        Log("Error while trying to rename photo");
                        next(err);
                     }
                  );
               },
            ],
            (err) => {
               if (err) reject(err);
               else resolve();
            }
         );
      });
   }

   /**
    * Convert a base64 string in a Blob according to the data and contentType.
    *
    * @param b64Data {String} Pure base64 string without contentType
    * @param contentType {String} the content type of the file i.e (image/jpeg - image/png - text/plain)
    * @param sliceSize {Int} SliceSize to process the byteCharacters
    * @see http://stackoverflow.com/questions/16245767/creating-a-blob-from-a-base64-string-in-javascript
    * @return Blob
    */
   b64toBlob(b64Data, contentType, sliceSize) {
      contentType = contentType || "";
      sliceSize = sliceSize || 512;

      var byteCharacters = atob(b64Data);
      var byteArrays = [];

      for (
         var offset = 0;
         offset < byteCharacters.length;
         offset += sliceSize
      ) {
         var slice = byteCharacters.slice(offset, offset + sliceSize);

         var byteNumbers = new Array(slice.length);
         for (var i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
         }

         var byteArray = new Uint8Array(byteNumbers);

         byteArrays.push(byteArray);
      }

      var blob = new Blob(byteArrays, { type: contentType });
      return blob;
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

         async.series(
            [
               (next) => {
                  this.directoryEntry.getFile(
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
               },
            ],
            (err) => {
               if (err) reject(err);
               else
                  resolve({
                     filename: filename,
                     fileEntry: fileEntry,
                     url: fileEntry.toURL(),
                     cdvfile: fileEntry.toInternalURL(),
                  });
            }
         );
      });
   }
}

export default CameraPlatform;
