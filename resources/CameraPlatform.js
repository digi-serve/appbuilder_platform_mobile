/**
 * @class CameraPlatform
 *
 * Manages taking photos with the device's camera, and saving them to the
 * app's data directory.
 *
 * You can use getCameraPhoto() or getLibraryPhoto() to obtain an image file.
 *
 * Previously, it was possible to use the `url` or `cdvfile` value of that
 * image to display the image in the DOM (inside an <img> tag). This is no
 * longer possible in iOS.
 * 
 * To display a camera image in the DOM, you can use the base64 data. First
 * you need the `filename` of the image that was provided earlier from 
 * getGameraPhoto(). Then use base64ByName().
 *
 *      camera
 *          .getCameraPhoto()
 *          .then((photo) => {
 *              return camera.base64ByName(photo.filename)
 *          })
 *          .then((base64Data) => {
 *              return '<img src="data:image/jpg;base64,' + base64Data + '" />'
 *          })
 *
 * Exports a singleton instance.
 */
"use strict";

import async from "async";
import EventEmitter from "eventemitter2";
import Log from "./Log";
import uuid from "uuid/v1";

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
      this.camera = {
         getPicture: () => {
            return Promise.reject(new Error("Device not ready"));
         }
      };

      this.init();
   }

   init() {
      document.addEventListener(
         "deviceready",
         () => {
            this.camera = navigator.camera;
            window.resolveLocalFileSystemURL(
               cordova.file.dataDirectory,
               (_directoryEntry) => {
                  this.directoryEntry = _directoryEntry;
                  this.emit("ready");
               },
               (err) => {
                  console.log("Could not get data directory", err);
                  //throw err;
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
               targetHeight: height
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
               this.savePhoto(imageURI)
                  .then((result) => {
                     resolve(result);
                  })
                  .catch(reject);
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
               targetHeight: height
            }
         );
      });
   }

   ////////
   // Photo file management
   ////////

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
                     function(/* file */) {
                        // File deleted successfully
                        next();
                     },
                     function(err) {
                        // Error while removing File
                        next(err);
                     }
                  );
               }
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
               }
            ],

            (err) => {
               if (err) reject(err);
               else {
                  resolve({
                     filename: filename,
                     fileEntry: targetFileEntry,
                     url: targetFileEntry.toURL(),
                     cdvfile: targetFileEntry.toInternalURL()
                  });
               }
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
                  cdvfile: _fileEntry.toInternalURL()
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
                  reader.onloadend = function() {
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
               }
            ],
            (err) => {
               if (err) reject(err);
               else
                  resolve({
                     filename: filename,
                     fileEntry: fileEntry,
                     url: fileEntry.toURL(),
                     cdvfile: fileEntry.toInternalURL()
                  });
            }
         );
      });
   }
}

export default CameraPlatform;
